/*
 * Arc Menu - The new Application Menu for GNOME 3
 *
 * Arc Menu Lead Developer
 * Andrew Zaech https://gitlab.com/AndrewZaech
 * 
 * Arc Menu Founder/Maintainer/Graphic Designer
 * LinxGem33 https://gitlab.com/LinxGem33
 * 
 * 
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 2 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 * Credits:
 * Complete list of credits and previous developers - https://gitlab.com/LinxGem33/Arc-Menu#credits
 * 
 * This project uses modified code from Gnome-Shell-Extensions (Apps-Menu and Places-Menu)
 * and modified code from Gnome-Shell source code.
 * https://gitlab.gnome.org/GNOME/gnome-shell-extensions/tree/master/extensions
 * https://github.com/GNOME/gnome-shell
 * 
 * Arc Menu also leverages some code from the Menu extension by Zorin OS and some utility 
 * functions from Dash to Panel https://github.com/home-sweet-gnome/dash-to-panel
 * 
 */

// Import Libraries
const Me = imports.misc.extensionUtils.getCurrentExtension();
const {Gio, GObject, Gtk, Meta, Shell} = imports.gi;
const Constants = Me.imports.constants;
const Main = imports.ui.main;


// Local constants
const MUTTER_SCHEMA = 'org.gnome.mutter';

/**
 * The Menu HotKeybinder class helps us to bind and unbind a menu hotkey
 * to the Arc Menu. Currently, valid hotkeys are Super_L and Super_R.
 */
var MenuHotKeybinder = class {

    constructor(menuToggler) {
        this._menuToggler = menuToggler;
        this.hotKeyEnabled = false;
        this.overlayKeyID = 0;
        this.defaultOverlayKeyID = 0;
        this._mutterSettings = new Gio.Settings({ 'schema': MUTTER_SCHEMA });
        this._hotkeyMenuToggleId = Main.layoutManager.connect('startup-complete', ()=>{
            this._updateHotkeyMenuToggle();
        });
    }

    // Set Main.overview.toggle to toggle Arc Menu instead
    enableHotKey(hotkey) {
        this._mutterSettings.set_string('overlay-key', hotkey);
        Main.wm.allowKeybinding('overlay-key', Shell.ActionMode.NORMAL |
            Shell.ActionMode.OVERVIEW | Shell.ActionMode.POPUP);
        this.hotKeyEnabled =  true;
        if(!Main.layoutManager._startingUp)
            this._updateHotkeyMenuToggle();
    }

    // Set Main.overview.toggle to default function and default hotkey
    disableHotKey() {
        this._mutterSettings.set_value('overlay-key', this._getDefaultOverlayKey());
        if(this.overlayKeyID > 0){
            global.display.disconnect(this.overlayKeyID);
            this.overlayKeyID = null;
        }
        if(this.defaultOverlayKeyID>0){
            GObject.signal_handler_unblock(global.display, this.defaultOverlayKeyID);
            this.defaultOverlayKeyID = null;
        }
        Main.wm.allowKeybinding('overlay-key', Shell.ActionMode.NORMAL |
            Shell.ActionMode.OVERVIEW);
        this.hotKeyEnabled = false;
       
    }

    // Update hotkey menu toggle function
    _updateHotkeyMenuToggle() {
        if(this.hotKeyEnabled){
            Main.wm.allowKeybinding('overlay-key', Shell.ActionMode.NORMAL |
               Shell.ActionMode.OVERVIEW | Shell.ActionMode.POPUP);

            //Find signal ID in Main.js that connects 'overlay-key' to global.display and toggles Main.overview
            let [bool,signal_id, detail] = GObject.signal_parse_name('overlay-key', global.display, true);
            this.defaultOverlayKeyID = GObject.signal_handler_find(global.display, GObject.SignalMatchType.ID, signal_id, detail, null, null, null); 

            //If signal ID found, block it and connect new 'overlay-key' to toggle arc menu.
            if(this.defaultOverlayKeyID>0){
                GObject.signal_handler_block(global.display, this.defaultOverlayKeyID);
                this.overlayKeyID = global.display.connect('overlay-key', () => {
                    this._menuToggler();
                });
            }
            else
                global.log("Arc Menu ERROR - Failed to set Super_L hotkey");
        }
    }
    _getDefaultOverlayKey() {
        return this._mutterSettings.get_default_value('overlay-key');
    }
    // Destroy this object
    destroy() {
        // Clean up and restore the default behaviour
        this.disableHotKey();
        if (this._hotkeyMenuToggleId) {
            // Disconnect the keybinding handler
            Main.layoutManager.disconnect(this._hotkeyMenuToggleId);
            this._hotkeyMenuToggleId = null;
        }
    }
};

/**
 * The Keybinding Manager class allows us to bind and unbind keybindings
 * to a keybinding handler.
 */
var KeybindingManager = class {
    constructor(settings) {
        this._settings = settings;
        this._keybindings = new Map();
    }

    // Bind a keybinding to a keybinding handler
    bind(keybindingNameKey, keybindingValueKey, keybindingHandler) {
        if (!this._keybindings.has(keybindingNameKey)) {
            this._keybindings.set(keybindingNameKey, keybindingValueKey);
            let keybinding = this._settings.get_string(keybindingNameKey);
            this._setKeybinding(keybindingNameKey, keybinding);

            Main.wm.addKeybinding(keybindingValueKey, this._settings,
                Meta.KeyBindingFlags.NONE,
                Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW | Shell.ActionMode.POPUP,
                keybindingHandler.bind(this));

            return true;
        }
        return false;
    }

    // Set or update a keybinding in the Arc Menu settings
    _setKeybinding(keybindingNameKey, keybinding) {
        if (this._keybindings.has(keybindingNameKey)) {
            let keybindingValueKey = this._keybindings.get(keybindingNameKey);
            let [key, mods] = Gtk.accelerator_parse(keybinding);

            if (Gtk.accelerator_valid(key, mods)) {
                let shortcut = Gtk.accelerator_name(key, mods);
                this._settings.set_strv(keybindingValueKey, [shortcut]);
            } else {
                this._settings.set_strv(keybindingValueKey, []);
            }
        }
    }

    // Unbind a keybinding
    unbind(keybindingNameKey) {
        if (this._keybindings.has(keybindingNameKey)) {
            let keybindingValueKey = this._keybindings.get(keybindingNameKey);
            Main.wm.removeKeybinding(keybindingValueKey);
            this._keybindings.delete(keybindingNameKey);
            return true;
        }
        return false;
    }

    // Destroy this object
    destroy() {
        let keyIter = this._keybindings.keys();
        for (let i = 0; i < this._keybindings.size; i++) {
            let keybindingNameKey = keyIter.next().value;
            this.unbind(keybindingNameKey);
        }
    }
};

/**
 * The Hot Corner Manager class allows us to disable and enable
 * the gnome-shell hot corners.
 */
var HotCornerManager = class {
    constructor(settings) {
        this._settings = settings;
        this._hotCornersChangedId = Main.layoutManager.connect('hot-corners-changed', this._redisableHotCorners.bind(this));
    }

    _redisableHotCorners() {
        if (this._settings.get_boolean('disable-activities-hotcorner')) {
            this.disableHotCorners();
        }
    }

    // Get all hot corners from the main layout manager
    _getHotCorners() {
        return Main.layoutManager.hotCorners;
    }

    // Enable all hot corners
    enableHotCorners() {
        // Restore the default behaviour and recreate the hot corners
        Main.layoutManager._updateHotCorners();
    }

    // Disable all hot corners
    disableHotCorners() {
        let hotCorners = this._getHotCorners();
        // Monkey patch each hot corner
        hotCorners.forEach(function (corner) {
            if (corner) {
                corner._toggleOverview = () => { };
                corner._pressureBarrier._trigger = () => { };
            }
        });
    }

    // Destroy this object
    destroy() {
        if (this._hotCornersChangedId>0) {
            Main.layoutManager.disconnect(this._hotCornersChangedId);
            this._hotCornersChangedId = 0;
        }

        // Clean up and restore the default behaviour
        this.enableHotCorners();
    }
};
