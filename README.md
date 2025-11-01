# ThemeKeeper GNOME Extension

ThemeKeeper is a GNOME Shell extension that automatically manages your themes and wallpapers based on light/dark mode and Night Light status.  
It saves current settings and applies then when changing style .

## Features

- Automatic management of GTK, icon, cursor, shell, and accent color themes based on light/dark mode.
- Monitors wallpaper changes to restore wallpapers associated with light and dark modes.
- Integrates with Night Light to automatically apply the dark theme when Night Light is active.
- Saves the current themes to custom DConf keys for light and dark modes.
- Option to enable or disable automatic mode via DConf.
- disable: dconf write /org/gnome/shell/extensions/themekeeper/automatic-mode false
- enable: dconf write /org/gnome/shell/extensions/themekeeper/automatic-mode true


## Installation

1. Clone the repository into the GNOME extensions folder:  
```bash
git clone https://github.com/your-username/themekeeper.git ~/.local/share/gnome-shell/extensions/themekeeper@yourdomain.com

OR

on https://extensions.gnome.org/
