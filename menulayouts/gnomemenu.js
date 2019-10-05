/*
 * Arc Menu: The new applications menu for Gnome 3.
 *
 * This file has been created specifically for ArcMenu under the terms of the GPLv2 licence by : 
 *
 * Original work: Copyright (C) 2019 Andrew Zaech 
 *
 * Artwork work: Copyright (C) 2017-2019 LinxGem33
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
 */

// Import Libraries
const Me = imports.misc.extensionUtils.getCurrentExtension();

const {Clutter, GLib, Gio, GMenu, Gtk, Shell, St} = imports.gi;
const AppFavorites = imports.ui.appFavorites;
const appSys = Shell.AppSystem.get_default();
const ArcSearch = Me.imports.search;
const Constants = Me.imports.constants;
const GnomeSession = imports.misc.gnomeSession;
const Gettext = imports.gettext.domain(Me.metadata['gettext-domain']);
const Main = imports.ui.main;
const MenuLayouts = Me.imports.menulayouts;
const MW = Me.imports.menuWidgets;
const PlaceDisplay = Me.imports.placeDisplay;
const PopupMenu = imports.ui.popupMenu;
const Utils =  Me.imports.utils;
const _ = Gettext.gettext;

var modernGnome = imports.misc.config.PACKAGE_VERSION >= '3.31.9';

var createMenu = class{
    constructor(mainButton) {
        this.button = mainButton;
        this._settings = mainButton._settings;
        this.mainBox = mainButton.mainBox; 
        this.appMenuManager = mainButton.appMenuManager;
        this.leftClickMenu  = mainButton.leftClickMenu;
        this.currentMenu = Constants.CURRENT_MENU.FAVORITES; 
        this._applicationsButtons = new Map();
        this._session = new GnomeSession.SessionManager();
     
        this.mainBox._delegate = this.mainBox;
        this._mainBoxKeyPressId = this.mainBox.connect('key-press-event', this._onMainBoxKeyPress.bind(this));

        this._tree = new GMenu.Tree({ menu_basename: 'applications.menu' });
        this._treeChangedId = this._tree.connect('changed', ()=>{
            this._reload();
        });
        //LAYOUT------------------------------------------------------------------------------------------------
        this.mainBox.vertical = true;
        
        this._firstAppItem = null;
        this._firstApp = null;
        this._tabbedOnce = false;

        //Sub Main Box -- stores left and right box
        this.subMainBox= new St.BoxLayout({
            vertical: false
        });
        this.mainBox.add(this.subMainBox, {
            expand: true,
            x_fill: true,
            y_fill: true,
            y_align: St.Align.START
        });

        //Right Box
        this.rightBox = new St.BoxLayout({
            vertical: true,
            style_class: 'right-box'
        });
        this.shorcutsBox = new St.BoxLayout({
            vertical: true
        });
        this.shortcutsScrollBox = new St.ScrollView({
            x_fill: true,
            y_fill: false,
            y_align: St.Align.START,
            overlay_scrollbars: true,
            style_class: 'vfade'
        });   
        this.shortcutsScrollBox.style = "width:250px;"; 
        this.shortcutsScrollBox.set_policy(Gtk.PolicyType.NEVER, Gtk.PolicyType.AUTOMATIC);

        this.shortcutsScrollBox.add_actor( this.shorcutsBox);
        this.shortcutsScrollBox.clip_to_allocation = true;
        this.rightBox.add( this.shortcutsScrollBox);
        // Left Box
        //Menus Left Box container
        this.leftBox = new St.BoxLayout({
            vertical: true,
            style_class: 'left-box'
        });
        this.subMainBox.add( this.leftBox, {
            expand: true,
            x_fill: true,
            y_fill: true,
            y_align: St.Align.START
        });
        //Add Vert Separator to Main Box
        this.subMainBox.add( this._createVertSeparator(), {
            expand: true,
            x_fill: true,
            y_fill: true
        });
        this._createLeftBox();
        this.subMainBox.add( this.rightBox, {
            expand: true,
            x_fill: true,
            y_fill: true,
            y_align: St.Align.START
        });

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
    _reload() {
        this.applicationsBox.destroy_all_children();
        this._applicationsButtons.clear();
        this._loadCategories();
        this._display();
    }
    updateStyle(){
    }
    // Display the menu
    _display() {
        //this.mainBox.hide();
        //this._applicationsButtons.clear();
        this._displayCategories();
        this._displayGnomeFavorites();
        
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
                if (app ){
                    this.applicationsByCategory[categoryId].push(app);
                    let item = this._applicationsButtons.get(app);
                    if (!item) {
                        item = new MW.ApplicationMenuItem(this, app);
                        this._applicationsButtons.set(app, item);
                    }
                }
                    
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
        
        this.categoryDirectories.push("");
        this.applicationsByCategory["Frequent Apps"] = [];

        this._usage = Shell.AppUsage.get_default();
        let mostUsed =  modernGnome ?  this._usage.get_most_used() : this._usage.get_most_used("");
        for (let i = 0; i < mostUsed.length; i++) {
            if (mostUsed[i] && mostUsed[i].get_app_info().should_show())
                this.applicationsByCategory["Frequent Apps"].push(mostUsed[i]);
        }
        
        
        this._tree.load_sync();
        let root = this._tree.get_root_directory();
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
        
        let categoryMenuItem = new MW.CategoryMenuItem(this, "","Favorites");
        this.categoryMenuItemArray.push(categoryMenuItem);
        this.applicationsBox.add_actor(categoryMenuItem.actor);	
        categoryMenuItem.setFakeActive(true);
        categoryMenuItem = new MW.CategoryMenuItem(this, "","All Programs");
        this.categoryMenuItemArray.push(categoryMenuItem);
        this.applicationsBox.add_actor(categoryMenuItem.actor);	
        for(var categoryDir of this.categoryDirectories){
            if(categoryDir){
                let categoryMenuItem = new MW.CategoryMenuItem(this, categoryDir);
                this.categoryMenuItemArray.push(categoryMenuItem);
                this.applicationsBox.add_actor(categoryMenuItem.actor);	
            }
        }

        
        this.updateStyle();
    }
    _displayGnomeFavorites(){
        let appList = AppFavorites.getAppFavorites().getFavorites();

        appList.sort(function (a, b) {
            return a.get_name().toLowerCase() > b.get_name().toLowerCase();
        });

        this._displayButtons(appList);
        this.updateStyle(); 


    }
    updateIcons(){   
        this._applicationsButtons.forEach((value,key,map)=>{
            map.get(key)._updateIcon();
        });    
    }
    _displayPlaces() {
    }
    _loadFavorites() {  
    }
    _displayFavorites() {     
    }
    // Create the menu layout

    _createLeftBox(){
        //Applications Box - Contains Favorites, Categories or programs
        this.applicationsScrollBox = new St.ScrollView({
            x_fill: true,
            y_fill: true,
            y_align: St.Align.START,
            style_class: 'apps-menu vfade left-scroll-area',
            overlay_scrollbars: true
        });
        this.applicationsScrollBox.set_policy(Gtk.PolicyType.NEVER, Gtk.PolicyType.AUTOMATIC);

        this.leftBox.add( this.applicationsScrollBox, {
            expand: true,
            x_fill: true, y_fill: true,
            y_align: St.Align.START
        });
        this.applicationsBox = new St.BoxLayout({ vertical: true });
        this.applicationsScrollBox.add_actor( this.applicationsBox);

        this.activitiesBox= new St.BoxLayout({ vertical: false });
        let activities = new MW.ActivitiesMenuItem(this);
            this.activitiesBox.add(activities.actor, {
                expand: true,
                x_fill: true,
                y_fill: false,
                y_align: St.Align.START
            });
        this.leftBox.add( this.activitiesBox, {
            expand: true,
            x_fill: true, y_fill: false,
            y_align: St.Align.END
        });
        
    }
    placesAddSeparator(id){ 
    }
    _redisplayPlaces(id) {
    }
    _createPlaces(id) {
    }
    getShouldShowShortcut(shortcutName){
    }
    // Scroll to a specific button (menu item) in the applications scroll view
    scrollToButton(button) {
        let appsScrollBoxAdj = this.applicationsScrollBox.get_vscroll_bar().get_adjustment();
        let appsScrollBoxAlloc = this.applicationsScrollBox.get_allocation_box();
        let currentScrollValue = appsScrollBoxAdj.get_value();
        let boxHeight = appsScrollBoxAlloc.y2 - appsScrollBoxAlloc.y1;
        let buttonAlloc = button.actor.get_allocation_box();
        let newScrollValue = currentScrollValue;
        if (currentScrollValue > buttonAlloc.y1 - 10)
            newScrollValue = buttonAlloc.y1 - 10;
        if (boxHeight + currentScrollValue < buttonAlloc.y2 + 10)
            newScrollValue = buttonAlloc.y2 - boxHeight + 10;
        if (newScrollValue != currentScrollValue)
            appsScrollBoxAdj.set_value(newScrollValue);
    }
    
    setDefaultMenuView(){
        this._displayGnomeFavorites();
        let setDefaultActive = true;
        this._setActiveCategory(setDefaultActive);
    }

    _setActiveCategory(setDefaultActive=false){

        for (let i = 0; i < this.categoryMenuItemArray.length; i++) {
            let actor = this.categoryMenuItemArray[i];
            setDefaultActive ? actor.setFakeActive(i==0 ? true : false) : actor.setFakeActive(false);
        }
    }
    
    // Clear the applications menu box
    _clearApplicationsBox() {
        let actors = this.applicationsBox.get_children();
        for (let i = 0; i < actors.length; i++) {
            let actor = actors[i];
            this.applicationsBox.remove_actor(actor);
        }
    }

    // Select a category or show category overview if no category specified
    selectCategory(dir) {
        if (dir!="Frequent Apps") {
            this._displayButtons(this._listApplications(dir.get_menu_id()));
        }
        else if(dir=="Frequent Apps") {
            this._displayButtons(this._listApplications("Frequent Apps"));

        }
        else {
            this._displayCategories();
        }
        this.updateStyle();
    }

    // Display application menu items
    _displayButtons(apps) {
        if (apps) {
            let actors = this.shorcutsBox.get_children();
                for (let i = 0; i < actors.length; i++) {
                    let actor = actors[i];
                    this.shorcutsBox.remove_actor(actor);
                }
                for (let i = 0; i < apps.length; i++) {
                    let app = apps[i];
                    let item = this._applicationsButtons.get(app);
                    if (!item.actor.get_parent()) {
                            this.shorcutsBox.add_actor(item.actor);	
                    }
                    if(i==0){
                        item.setFakeActive(true);
                        item.grabKeyFocus();
                    }
                }
        }
    }
    _displayAllApps(){
        let appList= []
        this._applicationsButtons.forEach((value,key,map) => {
            appList.push(key);
        });
        appList.sort(function (a, b) {
            return a.get_name().toLowerCase() > b.get_name().toLowerCase();
        });
        this._displayButtons(appList);
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
        if (this._treeChangedId > 0) {
            this._tree.disconnect(this._treeChangedId);
            this._treeChangedId = 0;
            this._tree = null;
        }
    }
    // Create a vertical separator
    _createVertSeparator(){    
    let alignment = Constants.SEPARATOR_ALIGNMENT.VERTICAL;
    let style = Constants.SEPARATOR_STYLE.NORMAL;
    this.vertSep = new MW.SeparatorDrawingArea(this._settings,alignment,style,{
        x_expand:true,
        y_expand:true,
        style_class: 'vert-sep'
    });
    this.vertSep.queue_repaint();
    return  this.vertSep;
    }
};