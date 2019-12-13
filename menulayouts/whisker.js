/*
 * Arc Menu - A traditional application menu for GNOME 3
 *
 * Arc Menu Lead Developer
 * Andrew Zaech https://gitlab.com/AndrewZaech
 * 
 * Arc Menu Founder/Maintainer/Graphic Designer
 * LinxGem33 https://gitlab.com/LinxGem33
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

var createMenu = class {
    constructor(mainButton) {
        this._button = mainButton;
        this._settings = mainButton._settings;
        this.mainBox = mainButton.mainBox; 
        this.appMenuManager = mainButton.appMenuManager;
        this.leftClickMenu  = mainButton.leftClickMenu;
        this.currentMenu = Constants.CURRENT_MENU.FAVORITES; 
        this._applicationsButtons = new Map();
        this._session = new GnomeSession.SessionManager();
        this.newSearch = new ArcSearch.SearchResults(this);      
        this._mainBoxKeyPressId = this.mainBox.connect('key-press-event', this._onMainBoxKeyPress.bind(this));
        this.isRunning=true;
        this._tree = new GMenu.Tree({ menu_basename: 'applications.menu' });
        this._treeChangedId = this._tree.connect('changed', ()=>{
            this._reload();
        });

        //LAYOUT------------------------------------------------------------------------------------------------
        this.mainBox.vertical = true;
        //TOP BAR
        this.topBox= new St.BoxLayout({
            vertical: false
        });
        this.topBox.style ="margin: 0px 10px;spacing: 5px;";
        this.mainBox.add(this.topBox, {
            expand: true,
            x_fill: true,
            y_fill: true,
            y_align: St.Align.START
        });
        this.user = new MW.UserMenuItem(this);
        this.topBox.add(this.user.actor, {
            expand: true,
            x_fill: true,
            y_fill: false,
            y_align: St.Align.START
        });
        //create new section for Power, Lock, Logout, Suspend Buttons
        this.actionsBox = new St.BoxLayout({
            vertical: false
        });
        
        this.actionsBox.style ="spacing: 10px; margin-right:10px;";
        //check if custom arc menu is enabled
        if( this._settings.get_boolean('enable-custom-arc-menu'))
            this.actionsBox.add_style_class_name('arc-menu');
        
        //SettingsButton  
        let settingsButton= new MW.SettingsButton( this);
        this.actionsBox.add(settingsButton.actor, {
            expand: false,
            x_fill: true,
            x_align: St.Align.END,
            margin:5,
        });
        //UserButton  
        let userButton= new MW.UserButton( this);
        this.actionsBox.add(userButton.actor, {
            expand: false,
            x_fill: true,
            x_align: St.Align.END,
            margin:5,
        });
        //LockButton
        let lock = new MW.LockButton( this);
        this.actionsBox.add(lock.actor, {
            expand: false,
            x_fill: true,
            x_align: St.Align.END,
            margin:5,
        });
        //Logout Button
        let logout = new MW.LogoutButton( this);
        this.actionsBox.add(logout.actor, {
            expand: false,
            x_fill: true,
            x_align: St.Align.END,
            margin:5,
        });

  

        
        
        //add actionsbox to leftbox             
        this.topBox.add( this.actionsBox, {
            expand: false,
            x_fill: false,
            y_fill: false,
            y_align: St.Align.START,
            x_align: St.Align.END
        });
        this.mainBox.add(this.topBox, {
            expand: false,
            x_fill: true,
            y_fill: true,
            y_align: St.Align.START,
            x_align: St.Align.END,
        });

        //Top Search Bar
        // Create search box
        this.searchBox = new MW.SearchBox(this);
        this.searchBox.actor.style ="margin: 10px; padding-top: 0.0em; padding-bottom: 0.5em;padding-left: 0.4em;padding-right: 0.4em;";
        this._firstAppItem = null;
        this._firstApp = null;
        this._tabbedOnce = false;
        this._searchBoxChangedId = this.searchBox.connect('changed', this._onSearchBoxChanged.bind(this));
        this._searchBoxKeyPressId = this.searchBox.connect('key-press-event', this._onSearchBoxKeyPress.bind(this));
        this._searchBoxKeyFocusInId = this.searchBox.connect('key-focus-in', this._onSearchBoxKeyFocusIn.bind(this));
        //Add search box to menu
        this.mainBox.add(this.searchBox.actor, {
            expand: false,
            x_fill: true,
            y_fill: false,
            y_align: St.Align.START
        });

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
        this.shortcutsScrollBox.connect('key-press-event',(actor,event)=>{
            let key = event.get_key_symbol();
            if(key == Clutter.Up || key == Clutter.KP_Up)
                this.scrollToItem(this.activeMenuItem, this.shortcutsScrollBox, Constants.DIRECTION.UP);
            else if(key == Clutter.Down || key == Clutter.KP_Down)
                this.scrollToItem(this.activeMenuItem, this.shortcutsScrollBox, Constants.DIRECTION.DOWN);
        }) ; 
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
        if (!this.searchBox) {
            return Clutter.EVENT_PROPAGATE;
        }
        if (event.has_control_modifier()) {
            if(this.searchBox)
                this.searchBox.grabKeyFocus();
            return Clutter.EVENT_PROPAGATE;
        }

        let symbol = event.get_key_symbol();
        let key = event.get_key_unicode();

        switch (symbol) {
            case Clutter.KEY_BackSpace:
                if(this.searchBox){
                    if (!this.searchBox.hasKeyFocus()) {
                        this.searchBox.grabKeyFocus();
                        let newText = this.searchBox.getText().slice(0, -1);
                        this.searchBox.setText(newText);
                    }
                }
                return Clutter.EVENT_PROPAGATE;
            case Clutter.KEY_Tab:
            case Clutter.KEY_KP_Tab:
            case Clutter.Up:
            case Clutter.KP_Up:
            case Clutter.Down:
            case Clutter.KP_Down:
            case Clutter.Left:
            case Clutter.KP_Left:
            case Clutter.Right:
            case Clutter.KP_Right:
                return Clutter.EVENT_PROPAGATE;
            default:
                if (key.length != 0) {
                    if(this.searchBox){
                        this.searchBox.grabKeyFocus();
                        let newText = this.searchBox.getText() + key;
                        this.searchBox.setText(newText);
                    }
                }
        }
        return Clutter.EVENT_PROPAGATE;
    }
    setCurrentMenu(menu){
        this.currentMenu = menu;
    }
    getCurrentMenu(){
        return this.currentMenu;
    } 
    resetSearch(){ //used by back button to clear results
        this.searchBox.clear();
        this.setDefaultMenuView();
    }
    updateIcons(){
        this._applicationsButtons.forEach((value,key,map)=>{
            map.get(key)._updateIcon();
        });
        this.newSearch._reset();
        
    }
    _redisplayRightSide(){
    }
        // Redisplay the menu
        _redisplay() {
            if (this.applicationsBox)
                this._clearApplicationsBox();
            this._display();
        }
        updateStyle(){
            let addStyle=this._settings.get_boolean('enable-custom-arc-menu');
            if(this.newSearch){
                addStyle ? this.newSearch.setStyle('arc-menu-status-text') :  this.newSearch.setStyle('search-statustext'); 
                addStyle ? this.searchBox._stEntry.set_name('arc-search-entry') : this.searchBox._stEntry.set_name('search-entry');
            }
            if(this.actionsBox){
                this.actionsBox.get_children().forEach(function (actor) {
                    if(actor instanceof St.Button){
                        addStyle ? actor.add_style_class_name('arc-menu-action') : actor.remove_style_class_name('arc-menu-action');
                    }
                }.bind(this));
            }
        }
        _reload() {
            for (let i = 0; i < this.categoryDirectories.length; i++) {
                this.categoryDirectories[i].destroy();
            }    
            this.applicationsBox.destroy_all_children();
            this._loadCategories();
            this._display();
        }
        // Display the menu
        _display() {
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
                    if (app){
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
            this.applicationsByCategory = null;
            this.applicationsByCategory = {};
            this.categoryDirectories = null;
            this.categoryDirectories=[];   

            let categoryMenuItem = new MW.CategoryMenuItem(this, "","Favorites");
            this.categoryDirectories.push(categoryMenuItem);
            categoryMenuItem = new MW.CategoryMenuItem(this, "","All Programs");
            this.categoryDirectories.push(categoryMenuItem);

            this._tree.load_sync();
            let root =  this._tree.get_root_directory();
            let iter = root.iter();
            let nextType;
            while ((nextType = iter.next()) != GMenu.TreeItemType.INVALID) {
                if (nextType == GMenu.TreeItemType.DIRECTORY) {
                    let dir = iter.get_directory();                  
                    if (!dir.get_is_nodisplay()) {
                        let categoryId = dir.get_menu_id();
                        this.applicationsByCategory[categoryId] = [];
                        this._loadCategory(categoryId, dir);
                        categoryMenuItem = new MW.CategoryMenuItem(this, dir);
                        this.categoryDirectories.push(categoryMenuItem); 
                    }
                }
            }
        }
        _displayCategories(){
         	this._clearApplicationsBox();
            for (let i = 0; i < this.categoryDirectories.length; i++) {
                this.applicationsBox.add_actor(this.categoryDirectories[i].actor);	
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
        // Load menu place shortcuts
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
            this.applicationsScrollBox.connect('key-press-event',(actor,event)=>{
                let key = event.get_key_symbol();
                if(key == Clutter.Up || key == Clutter.KP_Up)
                    this.scrollToItem(this.activeMenuItem, this.applicationsScrollBox, Constants.DIRECTION.UP);
                else if(key == Clutter.Down || key == Clutter.KP_Down)
                    this.scrollToItem(this.activeMenuItem, this.applicationsScrollBox, Constants.DIRECTION.DOWN);
            }) ; 
            this.applicationsScrollBox.set_policy(Gtk.PolicyType.NEVER, Gtk.PolicyType.AUTOMATIC);
            this.leftBox.add( this.applicationsScrollBox, {
                expand: true,
                x_fill: true, y_fill: true,
                y_align: St.Align.START
            });
            this.applicationsBox = new St.BoxLayout({ vertical: true });
            this.applicationsScrollBox.add_actor( this.applicationsBox);
            this.applicationsScrollBox.clip_to_allocation = true;
            
        }
        placesAddSeparator(id){
        }
        _redisplayPlaces(id) {
        }
    	_createPlaces(id) {
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
    scrollToItem(button,scrollView, direction) {
        let appsScrollBoxAdj = scrollView.get_vscroll_bar().get_adjustment();
        let currentScrollValue = appsScrollBoxAdj.get_value();
        let box = button.actor.get_allocation_box();
        let buttonHeight = box.y1 - box.y2;
        direction == Constants.DIRECTION.UP ? buttonHeight = buttonHeight : buttonHeight = -buttonHeight;
        appsScrollBoxAdj.set_value(currentScrollValue + buttonHeight );
    }
        
        setDefaultMenuView(){
            this.searchBox.clear();
            this.newSearch._reset();
            let setDefaultActive = true;
            this._setActiveCategory(setDefaultActive);
            this._displayGnomeFavorites();
            let appsScrollBoxAdj = this.applicationsScrollBox.get_vscroll_bar().get_adjustment();
            appsScrollBoxAdj.set_value(0);
            appsScrollBoxAdj = this.shortcutsScrollBox.get_vscroll_bar().get_adjustment();
            appsScrollBoxAdj.set_value(0);
        }
        _setActiveCategory(setDefaultActive=false){

            for (let i = 0; i <  this.categoryDirectories.length; i++) {
                let actor =  this.categoryDirectories[i];    
                setDefaultActive ? actor.setFakeActive(i==0 ? true : false) : actor.setFakeActive(false);
            }
        }
        _onSearchBoxKeyPress(searchBox, event) {
            let symbol = event.get_key_symbol();
            if (!searchBox.isEmpty() && searchBox.hasKeyFocus()) {
                if (symbol == Clutter.Up) {
                    this.newSearch.getTopResult().actor.grab_key_focus();
                }
                else if (symbol == Clutter.Down) {
                    this.newSearch.getTopResult().actor.grab_key_focus();
            	}
    	    }
            return Clutter.EVENT_PROPAGATE;
        }
        _onSearchBoxKeyFocusIn(searchBox) {
            if (!searchBox.isEmpty()) {
                this.newSearch.highlightDefault(true);
           }
        }
   
        _onSearchBoxChanged(searchBox, searchString) {        
            if(this.currentMenu != Constants.CURRENT_MENU.SEARCH_RESULTS){              
            	this.currentMenu = Constants.CURRENT_MENU.SEARCH_RESULTS;        
            }
            if(searchBox.isEmpty()){  
                this.newSearch.setTerms(['']); 
                this.setDefaultMenuView();                     	          	
            	this.newSearch.actor.hide();
            }            
            else{         

                
                    let actors = this.shorcutsBox.get_children();
                        for (let i = 0; i < actors.length; i++) {
                            let actor = actors[i];
                            this.shorcutsBox.remove_actor(actor);
                    }
                    this.shorcutsBox.add(this.newSearch.actor); 
                 
                this.newSearch.highlightDefault(true);
 		        this.newSearch.actor.show();         
                this.newSearch.setTerms([searchString]); 
          	    
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
                    if (!item) {
                        item = new MW.ApplicationMenuItem(this, app);
                        this._applicationsButtons.set(app, item);
                    }
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
            for (let i = 0; i < this.categoryDirectories.length; i++) {
                this.categoryDirectories[i].destroy();
            }
            this._applicationsButtons.forEach((value,key,map)=>{
                value.destroy();
            });
            this.categoryDirectories=null;
            this._applicationsButtons=null;
    
            if(this.searchBox!=null){
                if (this._searchBoxChangedId > 0) {
                    this.searchBox.disconnect(this._searchBoxChangedId);
                    this._searchBoxChangedId = 0;
                }
                if (this._searchBoxKeyPressId > 0) {
                    this.searchBox.disconnect(this._searchBoxKeyPressId);
                    this._searchBoxKeyPressId = 0;
                }
                if (this._searchBoxKeyFocusInId > 0) {
                    this.searchBox.disconnect(this._searchBoxKeyFocusInId);
                    this._searchBoxKeyFocusInId = 0;
                }
                if (this._mainBoxKeyPressId > 0) {
                    this.mainBox.disconnect(this._mainBoxKeyPressId);
                    this._mainBoxKeyPressId = 0;
                }
            }
            if(this.newSearch){
                this.newSearch.destroy();
            }
    
            if (this._treeChangedId > 0) {
                this._tree.disconnect(this._treeChangedId);
                this._treeChangedId = 0;
                this._tree = null;
            }
            this.isRunning=false;

        }
          //Create a horizontal separator
    _createHorizontalSeparator(style){
        let alignment = Constants.SEPARATOR_ALIGNMENT.HORIZONTAL;
        let hSep = new MW.SeparatorDrawingArea(this._settings,alignment,style,{
            x_expand:true,
            y_expand:false
        });
        hSep.queue_repaint();
        return hSep;
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
