'use strict';

const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const GObject = imports.gi.GObject;
const St = imports.gi.St;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Main = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;
const ByteArray = imports.byteArray;


// For compatibility checks, as described above
const Config = imports.misc.config;
const SHELL_MINOR = parseInt(Config.PACKAGE_VERSION.split('.')[1]);

// ================================================
// Extension hooks
// ================================================

var indicator = null;

function init() {
    log(`initializing ${Me.metadata.name} version ${Me.metadata.version}`);
}

function enable() {
    log(`enabling ${Me.metadata.name} version ${Me.metadata.version}`);

    indicator = new LauncherMenu();

    Main.panel.addToStatusArea(`${Me.metadata.name} Indicator`, indicator);

}

function disable() {
    log(`disabling ${Me.metadata.name} version ${Me.metadata.version}`);

    // REMINDER: It's required for extensions to clean up after themselves when
    // they are disabled. This is required for approval during review!
    if (indicator !== null) {
        indicator.destroy();
        indicator = null;
    }
}


// ================================================
// Menu
// ================================================

let settingsFilepath = '.gnome-launcher.cfg';

// We'll extend the Button class from Panel Menu so we can do some setup in
// the init() function.
var LauncherMenu = class LauncherMenu extends PanelMenu.Button {


    _init() {
        super._init(0.0, `${Me.metadata.name} Indicator`, false);

        // Init an empty menu
        let icon = new St.Icon({
            gicon: new Gio.ThemedIcon({name: 'starred-symbolic'}),
            style_class: 'system-status-icon'
        });
        if (SHELL_MINOR >= 34) {
            this.add_child(icon);
        } else {
            this.actor.add_child(icon);
        }

        // Create the settings file if not exist
        GLib.spawn_command_line_async('touch ' + settingsFilepath);

        // Fill the menu
        this.rebuildMenu();

        // Trigger when file is modified
        //let monitor = settingsFile.monitor(Gio.FileMonitorFlags.NONE, null);
        //monitor.connect('changed', function (settingsFile, otherFile, eventType) {
        //    // rebuild the menu
        //    this.rebuildMenu(settingsFile);
        //});

    }

    rebuildMenu() {
        let item = null;
        let that = this;

        // File with settings
        let settingsFile = Gio.File.new_for_path(settingsFilepath); // relative to ~

        try {
            let fileData = settingsFile.load_contents(null);
            let content = ByteArray.toString(fileData[1]);
            let lines = content.split("\n");


            let currentSection = this;
            let isSubmenu = false;

            for(let i = 0; i < lines.length; i++) {
                let line = lines[i];
                line = line.trim();

                if (!line || line.startsWith('#')) {
                    // empty line, ignore
                    continue;

                } else if (line == 'sep') {
                    // Separator
                    currentSection.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

                } else if (line.startsWith('folder:')) {
                    // Sub menu start or end
                    let title = line.substring(7);
                    if (title) {
                        // sub menu start
                        currentSection = new PopupMenu.PopupSubMenuMenuItem(line.substring(7), true);
                        this.menu.addMenuItem(currentSection);
                        isSubmenu = true;
                    } else {
                        // sub menu stop
                        currentSection = this;
                        isSubmenu = false;
                    }
                } else {
                    // Menu item (command)
                    // do not split because the command may contain '|'
                    let sep = line.indexOf('|');
                    let title = line;
                    let command = '';
                    if (sep >= 0) {
                        title = line.substring(0, sep);
                        // make more readable submenu items
                        if (isSubmenu) {
                            title = '\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0' + title;
                        }
                        command = line.substring(sep + 1);
                    }
                    item = new PopupMenu.PopupMenuItem(title);
                    currentSection.menu.addMenuItem(item);
                    item.connect('activate', (o, event) => {
                        try {
                            GLib.spawn_command_line_async(command);
                        } catch (e) {
                            log("Exception: " + e);
                            GLib.spawn_command_line_async("notify-send 'Gnome Launcher' '" + e + "'");
                        }
                     });
                }
            }

        } catch (e) {
            log("Exception: " + e);
            GLib.spawn_command_line_async("notify-send 'Gnome Launcher' '" + e + "'");
        }

        // Now add the final section
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this.menu.addAction('Settings', this.settingsAction, 'applications-system-symbolic');
        this.menu.addAction('Refresh Menu', function() {that.refreshAction();}, 'view-refresh-symbolic');
        //this.menu.addAction('About', this.aboutAction, 'preferences-system-details-symbolic');
    }

    /**
     * Open the settings file
     */
    settingsAction() {
        GLib.spawn_command_line_async('xdg-open ' + settingsFilepath);
    }

    /**
     * Open the settings file
     */
    refreshAction() {
        // close the meun
        this.menu.close();
        // remove all
        this.menu.removeAll();

        //this.setMenu(new PopupMenu.PopupMenu(this, 0.0, St.Side.TOP, 0));
        this.rebuildMenu()
    }

}

// Compatibility with gnome-shell >= 3.32
// (commented because this test does not work on Ubuntu 22.04)
//if (SHELL_MINOR > 30) {
    LauncherMenu = GObject.registerClass(
      {GTypeName: 'LauncherMenu'},
      LauncherMenu
    );
//}


