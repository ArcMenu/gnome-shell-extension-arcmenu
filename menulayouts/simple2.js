/*
 * Arc Menu: The new applications menu for Gnome 3.
 *
 * Original work: Copyright (C) 2015 Giovanni Campagna
 * Modified work: Copyright (C) 2016-2017 Zorin OS Technologies Ltd.
 * Modified work: Copyright (C) 2017 Alexander Rüedlinger
 * Modified work: Copyright (C) 2017-2019 LinxGem33
 * Modified work: Copyright (C) 2019 Andrew Zaech
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
 *
 * Credits:
 * This file is based on code from the Gnome Applications Menu Extension by Giovanni Campagna.
 * Some code was also referenced from the Gnome Places Status Indicator by Giovanni Campagna
 * and Gno-Menu by The Panacea Projects.
 * These extensions can be found at the following URLs:
 * http://git.gnome.org/browse/gnome-shell-extensions/
 * https://github.com/The-Panacea-Projects/Gnomenu
 */

// Import Libraries
const Signals = imports.signals;
const Atk = imports.gi.Atk;
const GMenu = imports.gi.GMenu;
const Shell = imports.gi.Shell;
const St = imports.gi.St;
const Clutter = imports.gi.Clutter;
const Main = imports.ui.main;
const PopupMenu = imports.ui.popupMenu;
const Gtk = imports.gi.Gtk;
const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;
const GObject = imports.gi.GObject;
const AppFavorites = imports.ui.appFavorites;
const Util = imports.misc.util;
const GnomeSession = imports.misc.gnomeSession;
const ExtensionUtils = imports.misc.extensionUtils;
const ExtensionSystem = imports.ui.extensionSystem;
const Me = ExtensionUtils.getCurrentExtension();
const PlaceDisplay = Me.imports.placeDisplay;
const MW = Me.imports.menuWidgets;

const MenuLayouts = Me.imports.menulayouts;

const ArcSearch = Me.imports.search;
const Constants = Me.imports.constants;

const Gettext = imports.gettext.domain(Me.metadata['gettext-domain']);
const _ = Gettext.gettext;
const Utils =  Me.imports.utils;
const appSys = Shell.AppSystem.get_default();
const PanelMenu = imports.ui.panelMenu;
let modernGnome = imports.misc.config.PACKAGE_VERSION >= '3.31.9';

// Application Menu Button class (most of the menu logic is here)
var createMenu = class {
    constructor(mainButton) {
        this.button = mainButton;
        this._settings = mainButton._settings;
        this.section = mainButton.section;
        this.mainBox = mainButton.mainBox; 
        this.appMenuManager = mainButton.appMenuManager;
        this.leftClickMenu  = mainButton.leftClickMenu;
        this.currentMenu = Constants.CURRENT_MENU.FAVORITES; 
        this._applicationsButtons = mainButton._applicationsButtons;
        this._session = new GnomeSession.SessionManager();
        this.leftClickMenu.actor.style = 'max-height: 60em;'
        this.mainBox._delegate = this.mainBox;
        this._mainBoxKeyPressId = this.mainBox.connect('key-press-event', this._onMainBoxKeyPress.bind(this));


        //LAYOUT------------------------------------------------------------------------------------------------
        this.mainBox.vertical = true;
        
        this._firstAppItem = null;
        this._firstApp = null;
        this._tabbedOnce = false;


        this._createLeftBox();


        this._loadCategories();

        this._display(); 
    }
    _onMainBoxKeyPress(mainBox, event) {

        return Clutter.EVENT_PROPAGATE;
    }
    setCurrentMenu(menu){
        this.currentMenu = menu;
    }
    getCurrentMenu(){
        return this.currentMenu;
    } 
    resetSearch(){ //used by back button to clear results
        this.setDefaultMenuView();  
    }
    _redisplayRightSide(){
        this.leftBox.destroy_all_children();
        this._createLeftBox();
        this._displayCategories();
        this.updateStyle();
    }
        // Redisplay the menu
        _redisplay() {
            if (this.applicationsBox)
                this._clearApplicationsBox();
            this._display();
        }
        updateStyle(){
            let addStyle=this._settings.get_boolean('enable-custom-arc-menu');
  
            if(addStyle){
            
                if(this.actionsBox){
                    this.actionsBox.actor.get_children().forEach(function (actor) {
                        if(actor instanceof St.Button){
                            actor.add_style_class_name('arc-menu-action');
                        }
                    }.bind(this));
                }
            }
            else
            {       
                
                if(this.actionsBox){
                    this.actionsBox.actor.get_children().forEach(function (actor) {
                        if(actor instanceof St.Button){
                            actor.remove_style_class_name('arc-menu-action');
                        }
                    }.bind(this));
                }
            }
        }
        // Display the menu
        _display() {
            //this.mainBox.hide();
            this._applicationsButtons.clear();
            this._displayCategories();
            //this._displayAllApps();
            
            if(this.vertSep!=null)
                this.vertSep.queue_repaint(); 
            
        }
        // Load menu category data for a single category
        _loadCategory(categoryId, dir) {
            let iter = dir.iter();
            let nextType;
            while ((nextType = iter.next()) != GMenu.TreeItemType.INVALID) {
                if (nextType == GMenu.TreeItemType.ENTRY) {
                    let entry = iter.get_entry();
                    let id;
                    try {
                        id = entry.get_desktop_file_id();
                    } catch (e) {
                        continue;
                    }
                    let app = appSys.lookup_app(id);
                    if (app && app.get_app_info().should_show())
                        this.applicationsByCategory[categoryId].push(app);
                } else if (nextType == GMenu.TreeItemType.DIRECTORY) {
                    let subdir = iter.get_directory();
                    if (!subdir.get_is_nodisplay())
                        this._loadCategory(categoryId, subdir);
                }
            }
        }

        // Load data for all menu categories
        _loadCategories() {
            this.applicationsByCategory = {};
            this.categoryDirectories=[];
            
      
            let tree = new GMenu.Tree({ menu_basename: 'applications.menu' });
            tree.load_sync();
            let root = tree.get_root_directory();
            let iter = root.iter();
            let nextType;
            while ((nextType = iter.next()) != GMenu.TreeItemType.INVALID) {
                if (nextType == GMenu.TreeItemType.DIRECTORY) {
                    let dir = iter.get_directory();                  
                    if (!dir.get_is_nodisplay()) {
                        let categoryId = dir.get_menu_id();
                        this.applicationsByCategory[categoryId] = [];
                        this._loadCategory(categoryId, dir);
                        this.categoryDirectories.push(dir);  
                    }
                }
            }
        }
        _displayCategories(){

         	this._clearApplicationsBox();
            this.categoryMenuItemArray=[];
            
                let categoryMenuItem = new MW.CategorySubMenuItem(this, "","All Programs");
                
                this._displayAllApps(categoryMenuItem);
                

                this.categoryMenuItemArray.push(categoryMenuItem);
                this.applicationsBox.addMenuItem(categoryMenuItem);	
                
               
                categoryMenuItem = new MW.CategorySubMenuItem(this, "","Favorites");

                this._displayGnomeFavorites(categoryMenuItem);

                this.categoryMenuItemArray.push(categoryMenuItem);
                this.applicationsBox.addMenuItem(categoryMenuItem);	
    		for(var categoryDir of this.categoryDirectories){
                if(!categoryDir){
                    
                }
                else{
                    let categoryMenuItem = new MW.CategorySubMenuItem(this, categoryDir);
                    
                    this.selectCategory(categoryDir,categoryMenuItem);


                    this.categoryMenuItemArray.push(categoryMenuItem);
                    this.applicationsBox.addMenuItem(categoryMenuItem);	
                }
            }

            
            this.updateStyle();
        }
        _displayGnomeFavorites(categoryMenuItem){
            let appList = AppFavorites.getAppFavorites().getFavorites();

            appList.sort(function (a, b) {
                return a.get_name().toLowerCase() > b.get_name().toLowerCase();
            });

            this._displayButtons(appList,categoryMenuItem);
            this.updateStyle(); 


        }
        // Load menu place shortcuts
        _displayPlaces() {
            let homePath = GLib.get_home_dir();
            let placeInfo = new MW.PlaceInfo(Gio.File.new_for_path(homePath), _("Home"));
            let addToMenu = this._settings.get_boolean('show-home-shortcut');
            if(addToMenu){
                let placeMenuItem = new MW.PlaceMenuItem(this, placeInfo);
                this.shorcutsBox.add_actor(placeMenuItem.actor);
            }    
            let dirs = Constants.DEFAULT_DIRECTORIES.slice();
            var SHORTCUT_TRANSLATIONS = [_("Documents"),_("Downloads"), _("Music"),_("Pictures"),_("Videos")];
            for (let i = 0; i < dirs.length; i++) {
                let path = GLib.get_user_special_dir(dirs[i]);
                if (path == null || path == homePath)
                    continue;
                let placeInfo = new MW.PlaceInfo(Gio.File.new_for_path(path), _(SHORTCUT_TRANSLATIONS[i]));
                addToMenu = this.getShouldShowShortcut(Constants.RIGHT_SIDE_SHORTCUTS[i+1]);
                if(addToMenu){
                    let placeMenuItem = new MW.PlaceMenuItem(this, placeInfo);
                    this.shorcutsBox.add_actor(placeMenuItem.actor);
                }
            }
        }
        _loadFavorites() {
         
        }
        _displayFavorites() {
            
        }
        // Create the menu layout

        _createLeftBox(){
          
            let actors = this.section.actor.get_children();
            for (let i = 0; i < actors.length; i++) {
                let actor = actors[i];
                this.section.actor.remove_actor(actor);
            }
            this.applicationsBox = new PopupMenu.PopupMenuSection();
            this.section.addMenuItem(this.applicationsBox); 

            
        }
        placesAddSeparator(id){
            this._sections[id].box.add(this._createHorizontalSeparator(true), {
                x_expand: true,
                y_expand:false,
                x_fill: true,
                y_fill: false,
                y_align: St.Align.END
            });  
        }
        _redisplayPlaces(id) {
            if(this._sections[id].length>0){
                this.bookmarksShorctus = false;
                this.externalDevicesShorctus = false;
                this.networkDevicesShorctus = false;
                this._sections[id].removeAll();
                this._sections[id].box.destroy_all_children();
            }
            this._createPlaces(id);
        }
    	_createPlaces(id) {
            let places = this.placesManager.get(id);
            if(this.placesManager.get('network').length>0)
                this.networkDevicesShorctus = true; 
            if(this.placesManager.get('devices').length>0)
                this.externalDevicesShorctus=true;  
            if(this.placesManager.get('bookmarks').length>0)
                this.bookmarksShorctus = true;

            if (this._settings.get_boolean('show-bookmarks')){
                if(id=='bookmarks' && places.length>0){
                    for (let i = 0; i < places.length; i++){
                        let item = new PlaceDisplay.PlaceMenuItem(places[i],this);
                        this._sections[id].addMenuItem(item); 
                    } 
                    //create a separator if bookmark and software shortcut are both shown
                    if(this.bookmarksShorctus && this.softwareShortcuts){
                        this.placesAddSeparator(id);
                    }
                }
            }
            if (this._settings.get_boolean('show-external-devices')){
                if(id== 'devices'){
                    for (let i = 0; i < places.length; i++){
                        let item = new PlaceDisplay.PlaceMenuItem(places[i],this);
                        this._sections[id].addMenuItem(item); 
                    }
                    if((this.externalDevicesShorctus &&  !this.networkDevicesShorctus)  
                        &&  (this.bookmarksShorctus || this.softwareShortcuts))
                            this.placesAddSeparator(id);
                }
                if(id== 'network'){
                    for (let i = 0; i < places.length; i++){
                        let item = new PlaceDisplay.PlaceMenuItem(places[i],this);
                        this._sections[id].addMenuItem(item); 
                    }
                    if(this.networkDevicesShorctus &&  (this.bookmarksShorctus || this.softwareShortcuts))
                            this.placesAddSeparator(id);                        
                }
            }
    	}

        //used to check if a shortcut should be displayed
        getShouldShowShortcut(shortcutName){
            let setting = 'show-'+shortcutName+'-shortcut';
            let settingName = GLib.utf8_strdown(setting,setting.length);
            let addToMenu =false;
            try{
                addToMenu = this._settings.get_boolean(settingName);
            }
            catch (err) {
              
            }
      	    return addToMenu;
        }
        // Scroll to a specific button (menu item) in the applications scroll view
        scrollToButton(button) {
       
        }
        
        setDefaultMenuView()
        {
            this._clearApplicationsBox();
       
               
                //this._displayCategories();
                //this._displayAllApps();


        }
        _setActiveCategory(){

            for (let i = 0; i < this.categoryMenuItemArray.length; i++) {
                let actor = this.categoryMenuItemArray[i];
                actor.setFakeActive(false);
                //actor.remove_style_class_name('active');
            }
        }
        
        // Clear the applications menu box
        _clearApplicationsBox() {
            //this.applicationsBox.removeAll();

        }

        // Select a category or show category overview if no category specified
        selectCategory(dir,categoryMenuItem) {

 
            if (dir!="Frequent Apps") {
                this._displayButtons(this._listApplications(dir.get_menu_id()),categoryMenuItem);
            }
            else if(dir=="Frequent Apps") {
                this._displayButtons(this._listApplications("Frequent Apps"),categoryMenuItem);
   
            }
            else {
                //this._displayCategories();
            }
            this.updateStyle();
        }

        // Display application menu items
        _displayButtons(apps,categoryMenuItem) {
            if (apps) {
               
        
                let oldApp;
                for (let i = 0; i < apps.length; i++) {
                    let app = apps[i];
                    if(oldApp!=app){
                    
                  
                        let item = new MW.ApplicationMenuItem(this, app);
                        
                 
                            
                        categoryMenuItem.menu.addMenuItem(item);	
                }
                    oldApp=app;
                   
                }
                
            }
        }
        _displayAllApps(categoryMenuItem){
            let appList=[];
            for(let directory in this.applicationsByCategory){
                appList = appList.concat(this.applicationsByCategory[directory]);
            }
            appList.sort(function (a, b) {
                return a.get_name().toLowerCase() > b.get_name().toLowerCase();
            });
            this._displayButtons(appList,categoryMenuItem);
            this.updateStyle(); 

        }
        // Get a list of applications for the specified category or search query
        _listApplications(category_menu_id) {
            let applist;

            // Get applications in a category or all categories
            if (category_menu_id) {
                applist = this.applicationsByCategory[category_menu_id];
            } else {
                applist = [];
                for (let directory in this.applicationsByCategory)
                    applist = applist.concat(this.applicationsByCategory[directory]);
            }
            if(category_menu_id != "Frequent Apps"){
                applist.sort(function (a, b) {
                    return a.get_name().toLowerCase() > b.get_name().toLowerCase();
                });
            }
            
            return applist;
        }
        destroy(){


        }
        //Create a horizontal separator
        _createHorizontalSeparator(rightSide){
            let hSep = new St.DrawingArea({
                 x_expand:true,
                 y_expand:false
             });
             if(rightSide)
                 hSep.set_height(15); //increase height if on right side
             else 
                 hSep.set_height(10);
             hSep.connect('repaint', ()=> {
                 let cr = hSep.get_context();
                 let [width, height] = hSep.get_surface_size();                 
                 let b, stippleColor;                                                            
                 [b,stippleColor] = Clutter.Color.from_string(this._settings.get_string('separator-color'));           
                 if(rightSide){   
                     cr.moveTo(width / 4, height-7.5);
                     cr.lineTo(3 * width / 4, height-7.5);
                 }   
                 else{   
                     cr.moveTo(25, height-4.5);
                     cr.lineTo(width-25, height-4.5);
                 }
                 //adjust endpoints by 0.5 
                 //see https://www.cairographics.org/FAQ/#sharp_lines
                 Clutter.cairo_set_source_color(cr, stippleColor);
                 cr.setLineWidth(1);
                 cr.stroke();
             });
             hSep.queue_repaint();
             return hSep;
         }
         // Create a vertical separator
         _createVertSeparator(){      
             let vertSep = new St.DrawingArea({
                 x_expand:true,
                 y_expand:true,
                 style_class: 'vert-sep'
             });
             vertSep.connect('repaint', ()=> {
                 if(this._settings.get_boolean('vert-separator'))  {
                     let cr = vertSep.get_context();
                     let [width, height] = vertSep.get_surface_size();
                     let b, stippleColor;   
                     [b,stippleColor] = Clutter.Color.from_string(this._settings.get_string('separator-color'));   
                     let stippleWidth = 1;
                     let x = Math.floor(width / 2) + 0.5;
                     cr.moveTo(x,  0.5);
                     cr.lineTo(x, height - 0.5);
                     Clutter.cairo_set_source_color(cr, stippleColor);
                     cr.setLineWidth(stippleWidth);
                     cr.stroke();
                 }
             }); 
             vertSep.queue_repaint();
             return vertSep;
         }
    };
