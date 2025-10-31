// SPDX-FileCopyrightText:
// SPDX-License-Identifier: GPL-3.0-or-later

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

export default class ThemeKeeperExtension {
    constructor() {
        // Night Light proxy
        this._nightLightProxy = null;

        // Settings objects
        this._settings = null;
        this._interfaceSettings = null;
        this._lastNightLightState = null;

        // Stored wallpapers for light/dark modes
        this._storedWallpapers = { light: null, dark: null };

        // Signal handler IDs
        this._wallpaperChangeHandler = null;
        this._styleChangeHandler = null;

        // Dconf path for ThemeKeeper extension
        this._dconfPath = '/org/gnome/shell/extensions/themekeeper/';
    }

    _logError(e) {
        // Log errors safely
        try {
            if (typeof logError === 'function') {
                logError(e);
                return;
            }
            if (typeof global !== 'undefined' && typeof global.logError === 'function') {
                global.logError(e);
                return;
            }
        } catch (_) {
            // ignore
        }
        console.error(e);
    }

    enable() {
        console.log('ThemeKeeper: Enabled');
        this._initMonitoring();
    }

    disable() {
        console.log('ThemeKeeper: Disabled');

        if (this._nightLightProxy)
            this._nightLightProxy = null;

        if (this._settings) {
            if (this._wallpaperChangeHandler)
                this._settings.disconnect(this._wallpaperChangeHandler);
            this._settings = null;
        }

        if (this._interfaceSettings) {
            if (this._styleChangeHandler)
                this._interfaceSettings.disconnect(this._styleChangeHandler);
            this._interfaceSettings = null;
        }

        this._lastNightLightState = null;
    }

    // --- DCONF Access (kept synchronous) -----------------------------
    _getDconfBoolean(key, defaultValue = null) {
        try {
            const [success, stdout] = GLib.spawn_command_line_sync(
                `dconf read ${this._dconfPath}${key}`
            );
            if (success && stdout) {
                const value = stdout.toString().trim();
                if (value === '') return defaultValue;
                return value === 'true';
            }
        } catch (e) {
            this._logError(e);
        }
        return defaultValue;
    }

    _setDconfBoolean(key, value) {
        try {
            const boolValue = value ? 'true' : 'false';
            GLib.spawn_command_line_sync(`dconf write ${this._dconfPath}${key} ${boolValue}`);
        } catch (e) {
            this._logError(e);
        }
    }

    _getDconfString(key, defaultValue = null) {
        try {
            const [success, stdout] = GLib.spawn_command_line_sync(
                `dconf read ${this._dconfPath}${key}`
            );
            if (success && stdout) {
                let value = stdout.toString().trim();
                if (value === '') return defaultValue;
                if (value.startsWith("'") && value.endsWith("'"))
                    value = value.slice(1, -1);
                return value;
            }
        } catch (e) {
            this._logError(e);
        }
        return defaultValue;
    }

    _setDconfString(key, value) {
        try {
            GLib.spawn_command_line_sync(`dconf write ${this._dconfPath}${key} "'${value}'"`);
        } catch (e) {
            this._logError(e);
        }
    }
    // -----------------------------------------------------------------

    _getCurrentShellTheme() {
        try {
            const [success, stdout] = GLib.spawn_command_line_sync(
                'dconf read /org/gnome/shell/extensions/user-theme/name'
            );
            if (success && stdout) {
                let value = stdout.toString().trim();
                if (value === '') return '';
                if (value.startsWith("'") && value.endsWith("'"))
                    value = value.slice(1, -1);
                return value;
            }
        } catch (e) {
            this._logError(e);
        }
        return '';
    }

    _getAutomaticMode() {
        let automaticMode = this._getDconfBoolean('automatic-mode', null);
        if (automaticMode === null) {
            this._setDconfBoolean('automatic-mode', true);
            return true;
        }
        return automaticMode;
    }

    _saveCurrentThemeToLightKeys() {
        try {
            const currentGtk = this._interfaceSettings.get_string('gtk-theme');
            const currentIcon = this._interfaceSettings.get_string('icon-theme');
            const currentCursor = this._interfaceSettings.get_string('cursor-theme');
            const currentAccent = this._interfaceSettings.get_string('accent-color');
            const currentShell = this._getCurrentShellTheme();

            this._setDconfString('light-gtk-theme', currentGtk);
            this._setDconfString('light-icon-theme', currentIcon);
            this._setDconfString('light-cursor-theme', currentCursor);
            this._setDconfString('light-accent-color', currentAccent);
            this._setDconfString('light-shell-theme', currentShell || 'Default');
        } catch (e) {
            this._logError(e);
        }
    }

    _saveCurrentThemeToDarkKeys() {
        try {
            const currentGtk = this._interfaceSettings.get_string('gtk-theme');
            const currentIcon = this._interfaceSettings.get_string('icon-theme');
            const currentCursor = this._interfaceSettings.get_string('cursor-theme');
            const currentAccent = this._interfaceSettings.get_string('accent-color');
            const currentShell = this._getCurrentShellTheme();

            this._setDconfString('dark-gtk-theme', currentGtk);
            this._setDconfString('dark-icon-theme', currentIcon);
            this._setDconfString('dark-cursor-theme', currentCursor);
            this._setDconfString('dark-accent-color', currentAccent);
            this._setDconfString('dark-shell-theme', currentShell || 'Default');
        } catch (e) {
            this._logError(e);
        }
    }

    _initMonitoring() {
        this._settings = new Gio.Settings({ schema_id: 'org.gnome.desktop.background' });
        this._interfaceSettings = new Gio.Settings({ schema_id: 'org.gnome.desktop.interface' });

        this._storedWallpapers.light = this._settings.get_string('picture-uri');
        this._storedWallpapers.dark = this._settings.get_string('picture-uri-dark');

        this._wallpaperChangeHandler = this._settings.connect('changed', (settings, key) => {
            if (key === 'picture-uri' || key === 'picture-uri-dark')
                this._handleWallpaperChange(key);
        });

        this._styleChangeHandler = this._interfaceSettings.connect('changed::color-scheme', () => {
            this._handleStyleChange();
        });

        if (this._getAutomaticMode())
            this._initNightLightMonitoring();
    }

    async _initNightLightMonitoring() {
        try {
            this._nightLightProxy = new Gio.DBusProxy({
                g_connection: Gio.DBus.session,
                g_interface_name: 'org.gnome.SettingsDaemon.Color',
                g_name: 'org.gnome.SettingsDaemon.Color',
                g_object_path: '/org/gnome/SettingsDaemon/Color',
                g_flags: Gio.DBusProxyFlags.NONE,
            });

            await this._nightLightProxy.init_async(null, null);

            const initial = this._nightLightProxy.NightLightActive;
            this._lastNightLightState = initial;
            this._handleNightLightChange(initial);

            this._nightLightProxy.connect('g-properties-changed', (p, changed) => {
                const nightLight = changed.lookup_value('NightLightActive', null);
                if (!nightLight) return;
                const newState = nightLight.unpack();
                if (this._lastNightLightState !== newState) {
                    this._lastNightLightState = newState;
                    this._handleNightLightChange(newState);
                }
            });
        } catch (e) {
            this._logError(e);
        }
    }

    _isPairedWallpaper(uri) {
        if (!uri) return false;
        const filename = uri.replace('file://', '').split('/').pop() || '';
        return /-l\.[a-zA-Z0-9]+$/.test(filename) || /-d\.[a-zA-Z0-9]+$/.test(filename);
    }

    _handleWallpaperChange(changedKey) {
        const newValue = this._settings.get_string(changedKey);
        const colorScheme = this._interfaceSettings.get_string('color-scheme');
        const isDark = colorScheme.includes('dark');

        const isPaired = this._isPairedWallpaper(newValue);

        if (isPaired) {
            if (changedKey === 'picture-uri') this._storedWallpapers.light = newValue;
            else this._storedWallpapers.dark = newValue;
        } else {
            if (changedKey === 'picture-uri' && isDark)
                this._settings.set_string('picture-uri', this._storedWallpapers.light);
            else if (changedKey === 'picture-uri-dark' && !isDark)
                this._settings.set_string('picture-uri-dark', this._storedWallpapers.dark);
            else {
                if (changedKey === 'picture-uri') this._storedWallpapers.light = newValue;
                else this._storedWallpapers.dark = newValue;
            }
        }
    }

    _handleStyleChange() {
        const colorScheme = this._interfaceSettings.get_string('color-scheme');
        const isDark = colorScheme.includes('dark');

        if (isDark) {
            this._saveCurrentThemeToLightKeys();
            this._applyDarkTheme();
        } else {
            this._saveCurrentThemeToDarkKeys();
            this._applyLightTheme();
        }
    }

    async _executeCommand(command) {
        try {
            const [success, argv] = GLib.shell_parse_argv(command);
            if (!success) return;
            const subprocess = new Gio.Subprocess({
                argv,
                flags: Gio.SubprocessFlags.NONE,
            });
            subprocess.init(null);
            await subprocess.communicate_utf8_async(null, null);
        } catch (e) {
            this._logError(e);
        }
    }

    async _applyLightTheme() {
        try {
            const lightGtk = this._getDconfString('light-gtk-theme');
            const lightShell = this._getDconfString('light-shell-theme');
            const lightIcon = this._getDconfString('light-icon-theme');
            const lightCursor = this._getDconfString('light-cursor-theme');
            const lightAccent = this._getDconfString('light-accent-color');

            if (lightGtk) this._interfaceSettings.set_string('gtk-theme', lightGtk);

            if (lightShell && lightShell !== 'Default')
                await this._executeCommand(`dconf write /org/gnome/shell/extensions/user-theme/name "'${lightShell}'"`);
            else
                await this._executeCommand(`dconf reset /org/gnome/shell/extensions/user-theme/name`);

            if (lightIcon) this._interfaceSettings.set_string('icon-theme', lightIcon);
            if (lightCursor) this._interfaceSettings.set_string('cursor-theme', lightCursor);
            if (lightAccent) this._interfaceSettings.set_string('accent-color', lightAccent);
        } catch (e) {
            this._logError(e);
        }
    }

    async _applyDarkTheme() {
        try {
            const darkGtk = this._getDconfString('dark-gtk-theme');
            const darkShell = this._getDconfString('dark-shell-theme');
            const darkIcon = this._getDconfString('dark-icon-theme');
            const darkCursor = this._getDconfString('dark-cursor-theme');
            const darkAccent = this._getDconfString('dark-accent-color');

            if (darkGtk) this._interfaceSettings.set_string('gtk-theme', darkGtk);

            if (darkShell && darkShell !== 'Default')
                await this._executeCommand(`dconf write /org/gnome/shell/extensions/user-theme/name "'${darkShell}'"`);
            else
                await this._executeCommand(`dconf reset /org/gnome/shell/extensions/user-theme/name`);

            if (darkIcon) this._interfaceSettings.set_string('icon-theme', darkIcon);
            if (darkCursor) this._interfaceSettings.set_string('cursor-theme', darkCursor);
            if (darkAccent) this._interfaceSettings.set_string('accent-color', darkAccent);
        } catch (e) {
            this._logError(e);
        }
    }

    _handleNightLightChange(nightLightActive) {
        if (!this._getAutomaticMode()) return;

        if (nightLightActive) {
            this._interfaceSettings.set_string('color-scheme', 'prefer-dark');
            const currentDark = this._settings.get_string('picture-uri-dark');
            if (currentDark !== this._storedWallpapers.dark)
                this._settings.set_string('picture-uri-dark', this._storedWallpapers.dark);
        } else {
            this._interfaceSettings.set_string('color-scheme', 'default');
            const currentLight = this._settings.get_string('picture-uri');
            if (currentLight !== this._storedWallpapers.light)
                this._settings.set_string('picture-uri', this._storedWallpapers.light);
        }
    }
}

