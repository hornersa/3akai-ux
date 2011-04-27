/*
 * Licensed to the Sakai Foundation (SF) under one
 * or more contributor license agreements. See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership. The SF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License. You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied. See the License for the
 * specific language governing permissions and limitations under the License.
 */

/*
 * Dependencies
 *
 * /dev/lib/misc/trimpath.template.js (TrimpathTemplates)
 * /dev/lib/jquery/plugins/jquery.threedots.js (ThreeDots)
 */

require(["jquery", "sakai/sakai.api.core"], function($, sakai) {

    /**
     * @name sakai_global.createcontent
     *
     * @class createcontent
     *
     * @description
     * The 'createcontent' widget shows the most recent createcontent item, 
     * including its latest comment and one related createcontent item
     *
     * @version 0.0.1
     * @param {String} tuid Unique id of the widget
     * @param {Boolean} showSettings Show the settings of the widget or not
     */
    sakai_global.createcontent = function(tuid, showSettings) {


        /////////////////////////////
        // Configuration variables //
        /////////////////////////////

        // DOM identifiers
        var rootel = $("#" + tuid);
        var uploadLink = ".upload_link";
        var fileuploadContainer = "#fileupload_container";
        var createcontentItemTemplate = "#createcontent_item_template";
        var createcontentItem = ".createcontent_item";

        ///////////////////////
        // Utility functions //
        ///////////////////////

        /**
         * Parses an individual JSON search result (returned from the
         * /var/search/pool/me/manager.json data feed) to be displayed in
         * mycreatecontent.html.
         * @param {Object} result - individual result object from JSON data feed
         * @return {Object} object containing item.name, item.path, item.type (mimetype)
         *   and item.type_img_url (URL for mimetype icon) for the given result
         */
        var parseDataResult = function(result) {
            // initialize parsed item with default values
            var item = {
                name: result["sakai:pooled-content-file-name"],
                path: "/p/" + result["jcr:name"],
                type: sakai.api.i18n.General.getValueForKey(sakai.config.MimeTypes.other.description),
                type_img_url: sakai.config.MimeTypes.other.URL,
                size: "",
                _mimeType: sakai.api.Content.getMimeType(result),
                "_mimeType/page1-small": result["_mimeType/page1-small"],
                "jcr:name": result["jcr:name"]
            };
            var mimetypeData = sakai.api.Content.getMimeTypeData(result);
            // set the mimetype and corresponding image
            if(item._mimeType) {
                // we have a recognized file type - set the description and img URL
                item.type = sakai.api.i18n.General.getValueForKey(sakai.config.MimeTypes[item._mimeType].description);
                item.type_img_url = sakai.config.MimeTypes[item._mimeType].URL;
            }

            // set file name without the extension
            // be aware that links don't have an extension
            var lastDotIndex = result["sakai:pooled-content-file-name"].lastIndexOf(".");
            if(lastDotIndex !== -1) {
                if (item.type !== "x-sakai/link") {
                    // extension found
                    item.name = result["sakai:pooled-content-file-name"].slice(0, lastDotIndex);
                }
            }
            item.name = sakai.api.Util.applyThreeDots(item.name, $(".mycreatecontent_widget .s3d-widget-createcontent").width() - 80, {max_rows: 1,whole_word: false}, "s3d-bold");

            // set the file size
            if(result.hasOwnProperty("_length") && result["_length"]) {
                item.size = "(" + sakai.api.Util.convertToHumanReadableFileSize(result["_length"]) + ")";
            }
            var usedin = 0;
            usedin = result["sakai:pooled-content-manager"].length;
            for(var i =0;i<result["sakai:pooled-content-viewer"].length;i++){
                if(result["sakai:pooled-content-viewer"][i] !== "anonymous" && result["sakai:pooled-content-viewer"][i] !== "everyone")
                usedin++;
            }

            item.usedin = usedin;
            var path = result["jcr:path"];
            if (result[path + "/comments"]) {
                var lastmodified = result[path + "/comments"]["_lastModified"];
                var totalcomment = 0;
                var commentpath = "";
                for (var obj in result[path + "/comments"]) {
                    if (obj.indexOf(path + "/comments") > -1) {
                        totalcomment++;
                        commentpath = obj;
                    }
                }
                item.totalcomment = totalcomment;
                item.comment = result[path + "/comments"][commentpath];
            }

            return item;
        };

        /**
         * This AJAX callback function handles the search result data returned from
         * /var/search/pool/me/manager.json.  If the call was successful, up to 5 of
         * the most recently created files are presented to the user.
         * @param {Object} success - indicates the status of the AJAX call
         * @param {Object} data - JSON data from /var/search/pool/me/manager.json
         * @return None
         */
        var handlecreatecontentData = function(success, data) {
            if(success) {
                getRelatedContent(data.results[0]);
            }
        };

        /*
         * Bind Events
         */
        var addBinding = function (){
            $(".add_createcontent_button", rootel).click(function (ev) {
                $(window).trigger("init.newaddcontent.sakai");
                return false;
            });
        };

        /**
         * This function will replace all
         * @param {String} term The search term that needs to be converted.
         */
        var prepSearchTermForURL = function(term) {
            // Filter out http:// as it causes the search feed to break
            term = term.replace(/http:\/\//ig, "");
            // taken this from search_main until a backend service can get related content
            var urlterm = "";
            var split = $.trim(term).split(/\s/);
            if (split.length > 1) {
                for (var i = 0; i < split.length; i++) {
                    if (split[i]) {
                        urlterm += split[i] + " ";
                        if (i < split.length - 1) {
                            urlterm += "OR ";
                        }
                    }
                }
            }
            else {
                urlterm = "*" + term + "*";
            }
            return urlterm;
        };

        /**
         * Fetches the related content
         */
        var getRelatedContent = function(contentData){

            var managersList = "";
            var viewersList = "";

            for (var i = 0; i < contentData["sakai:pooled-content-manager"].length; i++) {
                if (contentData["sakai:pooled-content-manager"][i]) {
                    managersList += " " + (contentData["sakai:pooled-content-manager"][i]);
                }
            }
            for (var i = 0; i < contentData["sakai:pooled-content-viewer"].length; i++) {
                if (contentData["sakai:pooled-content-viewer"][i]) {
                    viewersList += " " + (contentData["sakai:pooled-content-viewer"][i]);
                }
            }

            var searchterm = contentData["sakai:pooled-content-file-name"] + " " + managersList + " " + viewersList;
            searchquery = prepSearchTermForURL(searchterm);

            // get related content for contentData
            // return some search results for now
            var params = {
                "items" : "11"
            };
            var url = sakai.config.URL.SEARCH_ALL_FILES.replace(".json", ".infinity.json");
            if (searchquery === '*' || searchquery === '**') {
                url = sakai.config.URL.SEARCH_ALL_FILES_ALL;
            } else {
                params["q"] = searchquery;
            }
            $.ajax({
                url: url,
                data: params,
                success: function(relatedContent){
                    var createcontentjson = {items: []};
                    var item = parseDataResult(contentData);
                    console.log(relatedContent);
                    if(relatedContent) {
                        item.relatedContent = parseDataResult(relatedContent.results[0]);
                    }
                    createcontentjson.items.push(item);
                    // pass the array to HTML view
                    createcontentjson.sakai = sakai;
                    console.log(createcontentjson);
                    $(createcontentItem, rootel).html(sakai.api.Util.TemplateRenderer(createcontentItemTemplate,createcontentjson));
                }
            });
            
        };

        /////////////////////////////
        // Initialization function //
        /////////////////////////////

        /**
         * Initiates fetching createcontent data to be displayed in the My createcontent widget
         * @return None
         */
        var init = function() {
            sakai.api.Widgets.widgetLoader.insertWidgets(tuid);
            addBinding();

            // get list of createcontent items
            $.ajax({
                url: "/var/search/pool/manager-viewer.json",
                cache: false,
                data: {
                    userid: sakai.data.me.user.userid,
                    page: 0,
                    items: 1,
                    sortOn: "_lastModified",
                    sortOrder: "desc"
                },
                success: function(data){
                    handlecreatecontentData(true, data);
                },
                error: function(data){
                    handlecreatecontentData(false);
                }
            });
        };

        // run init() function when sakai.createcontent object loads
        init();
    };

    sakai.api.Widgets.widgetLoader.informOnLoad("createcontent");
});
