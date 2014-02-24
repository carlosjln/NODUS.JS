/*!
 * NODUS.JS - v1.0.0
 * Front-End API for NODUS
 * https://github.com/carlosjln/NODUS.JS
 *
 * Author: Carlos J. Lopez
 * https://github.com/carlosjln
 */
(function(window, document) {
    var node_collection = {};
    var raw_node_collection = {};
    var node_actions_collection = {};
    var node_handlers_collection = {};
    var requested = {};
    var shared_context = {};
    var cached_views = {};
    var validated_nodes = {};
    function NODUS(){}
    var request_node_data = (function() {
            function request_data(node_id, callback, data) {
                (requested[node_id] = (requested[node_id] || {
                    data: false, handlers: false
                })).data = true;
                var context = {
                        validate: validate_node, node_id: node_id, callback: callback, data: data, parse_reply: NODUS.parse_reply
                    };
                AJAX({
                    url: node_id, context: context, before_request: before_request, on_success: on_success, on_error: default_exception_handler
                })
            }
            function before_request() {
                console.log("Requesting data for node { id='" + this.node_id + "' }")
            }
            function on_success(response) {
                var self = this;
                var node_id = self.node_id;
                var reply = NODUS.parse_reply(response);
                if (reply.has_errors()) {
                    return self.exception_handler(reply.exceptions)
                }
                update_node(node_id, reply.data);
                return validate_node_handlers(node_id, self.callback, self.data)
            }
            return request_data
        })();
    var request_action_handlers = (function() {
            function request_handlers(node_id, callback, data) {
                requested[node_id].handlers = true;
                var context = {
                        node_id: node_id, callback: callback, data: data, parse_reply: NODUS.parse_reply, exception_handler: default_exception_handler
                    };
                AJAX({
                    url: node_id + "/handlers", context: context, before_request: before_request, on_success: on_success, on_error: default_exception_handler
                })
            }
            function before_request() {
                var node = node_collection[this.node_id];
                console.log("Requesting action handlers for Node{ name=" + node.name + " id=" + node.id + " }")
            }
            function on_success(response) {
                var self = this;
                var reply = self.parse_reply(response);
                if (reply.has_errors()) {
                    return self.exception_handler(reply.exceptions)
                }
                set_handlers(self.node_id, reply.data);
                return self.callback(self.node_id, self.data)
            }
            return request_handlers
        })();
    var get_view = (function() {
            function request_view(node_id, data) {
                var node = node_collection[node_id];
                var handlers = node_handlers_collection[node_id];
                var view_handler = handlers["view"] || {is_empty: true};
                var on_exception = view_handler.on_exception || handlers.on_exception || default_exception_handler;
                var proceed;
                if (view_handler.is_empty) {
                    var exception = new ApplicationException("The Node [" + node.name + "] does not have a view handler.");
                    return on_exception.call(handlers, exception, data)
                }
                var before_request = view_handler.before_request || function() {
                        return true
                    };
                try {
                    proceed = before_request.call(view_handler, data)
                }
                catch(exception) {
                    return on_exception.call(view_handler, exception, data)
                }
                if (proceed) {
                    var on_success = view_handler.on_success || function() {
                            throw new Error("Handle.view.on_success is undefined.");
                        };
                    var context = {
                            node: node, NODE: Node, view_handler: view_handler, on_success: on_success, on_exception: on_exception
                        };
                    var cached_view = cached_views[node_id];
                    if (cached_view) {
                        return on_ajax_success.call(view_handler, cached_view)
                    }
                    AJAX({
                        url: node_id + "/view/", context: context, before_request: before_ajax_request, on_success: on_ajax_success, on_error: on_exception
                    })
                }
                return node
            }
            function before_ajax_request() {
                var node = this.node;
                console.log("Requesting view for Node{ name=" + node.name + " id=" + node.id + " }")
            }
            function on_ajax_success(response) {
                var self = this;
                var reply = NODUS.parse_reply(response);
                if (reply.has_errors()) {
                    return self.on_application_exception.call(self.view_handler, reply.exceptions)
                }
                var view = reply.data;
                var style_id = "view_" + self.node.id;
                if (view.cache) {
                    cached_views[self.node.id] = view
                }
                if (document.getElementById(style_id) === null) {
                    NODUS.create_style(view.style).id = style_id
                }
                try {
                    self.on_success.call(self.view_handler, view, self.data)
                }
                catch(on_success_exception) {
                    self.on_exception.call(self.view_handler, new ApplicationException(on_success_exception))
                }
            }
            return request_view
        })();
    function Node(object) {
        if (object instanceof Node) {
            return object
        }
        if (typeof object === "string") {
            return new Node({id: object})
        }
        var self = this;
        var node_id = object.id;
        if (self instanceof Node) {
            self.id = node_id;
            return self
        }
        return null
    }
    Node.prototype = {exec: function(action_name, query, data) {
            var action = this[action_name];
            if (typeof action === "function") {
                if (query && typeof query === "object") {
                    data = query;
                    query = null
                }
                execute_action(action.id, query, data)
            }
            else {
                console.log(new Error("The action '" + action_name + "' is undefined."))
            }
        }};
    Node.view = function(object, data) {
        object = typeof object === "string" ? object : object.id;
        validate_node(object, get_view, data)
    };
    function register_node(node) {
        var id = node.id;
        if (node_collection[id] instanceof Node) {
            return null
        }
        requested[id] = {
            data: false, handlers: false
        };
        node_collection[id] = node
    }
    function update_node(node_id, data) {
        var node = node_collection[node_id];
        if ((node instanceof Node) === false) {
            console.log(new Error("The node { id='" + node_id + "' } cannot be updated."));
            console.log(node);
            return null
        }
        node.name = data.name;
        node.caption = data.caption;
        node.parent_id = data.parent_id;
        raw_node_collection[node_id] = data;
        set_handlers(node_id, data["handlers"]);
        set_actions(node_id, data["actions"]);
        return node
    }
    function set_handlers(node_id, raw_handlers) {
        var node = node_collection[node_id];
        if ((node instanceof Node) === false || raw_handlers === null || raw_handlers === "") {
            return null
        }
        var handlers = {};
        var context = {
                node: node, handlers: handlers, shared: shared_context
            };
        try {
            new Function("context", "window", raw_handlers)(context, window)
        }
        catch(exception) {
            throw exception;
        }
        node_handlers_collection[node_id] = handlers;
        return node
    }
    function set_actions(node_id, raw_actions) {
        raw_actions = raw_actions || [];
        var node = node_collection[node_id];
        var i = raw_actions.length;
        if ((node instanceof Node) === false) {
            return null
        }
        while (i--) {
            var raw_action = raw_actions[i];
            var action_id = raw_action.id;
            var action_name = raw_action.name;
            var method = (function(id) {
                    return function(data) {
                            execute_action(id, null, data)
                        }
                })(action_id);
            var action = {
                    id: action_id, name: action_name, node_id: node_id, method: method
                };
            method.id = action_id;
            node[action_name] = method;
            node_actions_collection[action_id] = action
        }
        return node
    }
    function validate_node(node_id, callback, data) {
        console.log("Validating node { id='" + node_id + "' }");
        if (typeof node_id !== "string") {
            console.log(new Error("The [node id] must be a string GUID"));
            console.log("Instead received:", node_id);
            return null
        }
        register_node(Node(node_id));
        return validate_node_data(node_id, callback, data)
    }
    function validate_node_data(node_id, callback, data) {
        var data_is_avaliable = requested[node_id] !== undefined && requested[node_id].data === true;
        var method = data_is_avaliable ? validate_node_handlers : request_node_data;
        return method(node_id, callback, data)
    }
    function validate_node_handlers(node_id, callback, data) {
        console.log("Validating node handlers { id='" + node_id + "' }");
        if (requested[node_id].handlers === false) {
            return request_action_handlers(node_id, callback, data)
        }
        validated_nodes[node_id] = node_collection[node_id];
        return callback(node_id, data)
    }
    function execute_action(action_id, query, data) {
        if (action_id === null) {
            console.log("The action_id can't be null.");
            return null
        }
        query = query || "";
        data = data || {};
        var action = node_actions_collection[action_id];
        var node_id = action.node_id;
        if (validated_nodes[node_id] === null) {
            return validate_node(node_id, function() {
                    execute_action(action_id, query, data)
                })
        }
        var action_name = action.name;
        var node_handlers = node_handlers_collection[node_id];
        var action_handler = node_handlers.actions[action_name] || {is_empty: true};
        var on_success = action_handler.on_success;
        var before_request = action_handler.before_request || function() {
                return true
            };
        var get_query = action_handler.get_query || function() {
                return ""
            };
        var on_exception = action_handler.on_exception || node_handlers.actions.on_exception || node_handlers.on_exception || default_exception_handler;
        var continue_request;
        if (action_handler.is_empty) {
            console.log(new Error("The action '" + action_name + "' is not defined on the handler."));
            return false
        }
        if (on_success === undefined) {
            console.log(new Error("The method 'Handle.action." + action_name + ".on_success' is undefined."));
            return false
        }
        try {
            continue_request = before_request.call(action_handler, data)
        }
        catch(exception) {
            return on_exception.call(action_handler, exception)
        }
        if (continue_request) {
            query = query || get_query.call(action_handler, data);
            var query_string = 'query=' + encodeURIComponent(NODUS.encode_base64(query));
            var context = {
                    query: query, action_name: action_name, action_handler: action_handler, on_success: on_success, on_exception: on_exception
                };
            AJAX({
                url: 'action/' + action_id, method: "POST", send: query_string, context: context, before_request: ajax_before_request, on_success: ajax_on_success, on_error: on_exception
            })
        }
    }
    function ajax_before_request() {
        console.log("Executing action '{" + this.action_name + "}' with params:", this.query || null)
    }
    function ajax_on_success(response) {
        var reply = NODUS.parse_reply(response);
        var self = this;
        if (reply.has_errors()) {
            return self.on_exception.call(self.action_handler, reply.exceptions)
        }
        try {
            self.on_success.call(self.action_handler, reply, self.data)
        }
        catch(exception) {
            self.on_exception.call(self.action_handler, new ApplicationException(exception))
        }
    }
    function AJAX(options) {
        options.url = "node/" + options.url;
        options.on_error = options.on_error || default_exception_handler;
        NODUS.request(options)
    }
    function default_exception_handler(exception) {
        console.log("ApplicationException: ", exception)
    }
    function ApplicationException(exception) {
        var self = this;
        exception = typeof exception === 'string' ? {message: exception} : exception;
        self.validation = [];
        self.application = [{
                name: 'ApplicationException', message: exception ? exception.message : ''
            }]
    }
    function document_click_handler(e) {
        var element = (e.target || e.srcElement) || document;
        var node_id = get_attribute(element, "node-id");
        var action_id = get_attribute(element, "action-id");
        if (node_id || action_id) {
            e.preventDefault();
            element.blur()
        }
        if (node_id) {
            Node.view(node_id)
        }
        else if (action_id) {
            execute_action(action_id)
        }
    }
    function get_attribute(element, name) {
        var node_id = element.getAttribute(name);
        var parent_node;
        if (node_id === undefined && (parent_node = element.parentNode)) {
            node_id = parent_node.getAttribute(name)
        }
        return node_id
    }
    if (document.addEventListener) {
        document.addEventListener("click", document_click_handler, false)
    }
    else {
        document.attachEvent("onclick", document_click_handler)
    }
    NODUS.Node = Node;
    window.NODUS = NODUS;
    window.Node = Node
})(window, document);
(function(NODUS, window, document) {
    function build_tree(nodes) {
        var modules = {};
        var collection = {};
        var i = nodes.length;
        var j = i;
        var node;
        var parent;
        var node_id;
        var node_name;
        var new_node;
        nodes = nodes.slice(0);
        while (i--) {
            node = nodes[i];
            collection[node.id] = new Node(node)
        }
        while (j--) {
            node = nodes[j];
            node_name = node.name;
            node_id = node.id;
            parent = collection[node.parent_id];
            new_node = collection[node_id];
            if (parent === undefined) {
                modules[node_name] = new_node
            }
            else {
                parent[node_name] = new_node
            }
        }
        return modules
    }
    function parse_reply(object) {
        var exceptions = object.exceptions;
        exceptions.validation = filter(exceptions, function(e) {
            return e.type === "Validation"
        });
        exceptions.application = filter(exceptions, function(e) {
            return e.type === "Application"
        });
        exceptions.system = filter(exceptions, function(e) {
            return e.type === "System"
        });
        object.has_errors = function() {
            return this.exceptions.length > 0
        };
        return object
    }
    var get_type = (function() {
            var core_types = {
                    '[object Boolean]': 'boolean', '[object Number]': 'number', '[object String]': 'string', '[object Function]': 'function', '[object Array]': 'array', '[object Date]': 'date', '[object RegExp]': 'regexp', '[object Object]': 'object', '[object Error]': 'error'
                };
            var to_string = core_types.toString;
            function type(object) {
                var typeof_object = typeof(object);
                if (object === null) {
                    return 'null'
                }
                if (typeof_object === 'object' || typeof_object === 'function') {
                    return core_types[to_string.call(object)] || 'object'
                }
                return typeof_object
            }
            return type
        })();
    function copy(object, target) {
        var object_type = get_type(object);
        var clone;
        switch (object_type) {
            case"object":
                clone = target || {};
                for (var attribute in object) {
                    if (object.hasOwnProperty(attribute)) {
                        clone[attribute] = copy(object[attribute])
                    }
                }
                break;
            case"array":
                clone = target || [];
                for (var i = 0, len = object.length; i < len; i++) {
                    clone[i] = copy(object[i])
                }
                break;
            case"date":
                clone = new Date;
                clone.setTime(object.getTime());
                break;
            default:
                clone = object
        }
        return clone
    }
    function merge() {
        var objects = arguments;
        var length = objects.length;
        var target = {};
        var i = 0;
        for (; i < length; i++) {
            copy(objects[i], target)
        }
        return target
    }
    var B64KEY = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
    function encode_base64(input) {
        var key = B64KEY;
        var str = encode_utf8(input);
        var length = str.length;
        var index = 0;
        var output = "";
        var chr1,
            chr2,
            chr3,
            enc1,
            enc2,
            enc3,
            enc4;
        while (index < length) {
            chr1 = str.charCodeAt(index++);
            chr2 = str.charCodeAt(index++);
            chr3 = str.charCodeAt(index++);
            enc1 = chr1 >> 2;
            enc2 = ((chr1 & 3) << 4) | (chr2 >> 4);
            enc3 = ((chr2 & 15) << 2) | (chr3 >> 6);
            enc4 = chr3 & 63;
            if (isNaN(chr2)) {
                enc3 = enc4 = 64
            }
            else if (isNaN(chr3)) {
                enc4 = 64
            }
            output = output + key.charAt(enc1) + key.charAt(enc2) + key.charAt(enc3) + key.charAt(enc4)
        }
        return output
    }
    function encode_utf8(input) {
        var str = input.replace(/\r\n/g, "\n");
        var length = str.length;
        var index = 0;
        var output = "";
        var charcode;
        while (length--) {
            charcode = str.charCodeAt(index++);
            if (charcode < 128) {
                output += String.fromCharCode(charcode)
            }
            else if ((charcode > 127) && (charcode < 2048)) {
                output += String.fromCharCode((charcode >> 6) | 192);
                output += String.fromCharCode((charcode & 63) | 128)
            }
            else {
                output += String.fromCharCode((charcode >> 12) | 224);
                output += String.fromCharCode(((charcode >> 6) & 63) | 128);
                output += String.fromCharCode((charcode & 63) | 128)
            }
        }
        return output
    }
    function create_style(css) {
        var style = document.createElement("style");
        style.setAttribute("type", "text/css");
        if (style.styleSheet) {
            style.styleSheet.cssText = css
        }
        else {
            style.insertBefore(document.createTextNode(css), null)
        }
        document.getElementsByTagName('head')[0].insertBefore(style, null);
        return style
    }
    function filter(list, condition) {
        var length = list.length;
        var i = 0;
        var result = [];
        var item;
        for (; i < length; i++) {
            item = list[i];
            if (condition(item)) {
                result[result.length] = item
            }
        }
        return result
    }
    NODUS.Node.build_tree = build_tree;
    NODUS.parse_reply = parse_reply;
    NODUS.merge = merge;
    NODUS.encode_base64 = encode_base64;
    NODUS.encode_utf8 = encode_utf8;
    NODUS.create_style = create_style;
    NODUS.get_type = get_type
})(NODUS, window, document);
var NODUS;
(function(NODUS, window, document) {
    var get_type = NODUS.get_type;
    var get_transport = window.XMLHttpRequest ? function() {
            return new XMLHttpRequest
        } : function() {
            return new ActiveXObject("Microsoft.XMLHTTP")
        };
    function ajax(settings) {
        if ((this instanceof ajax) === false) {
            return new ajax(settings)
        }
        var self = this;
        var transport = self.transport = get_transport();
        var typeof_default_property;
        var value;
        for (var property in settings) {
            typeof_default_property = get_type(self[property]);
            value = settings[property];
            if (settings.hasOwnProperty(property) && (typeof_default_property === "undefined" || typeof_default_property === get_type(value))) {
                self[property] = value
            }
        }
        var method = self.method;
        var post_method = "POST";
        var context = self.context || self;
        self.before_request.call(context, self, settings);
        transport.open(method, self.url, true);
        transport.onreadystatechange = function() {
            self.on_ready_state_change.call(self)
        };
        if (method === post_method) {
            transport.setRequestHeader('Content-type', 'application/x-www-form-urlencoded')
        }
        transport.send(self.send)
    }
    ajax.prototype = {
        constructor: ajax, url: "", method: "GET", before_request: function(xhr, settings){}, on_complete: function(response){}, on_success: function(response){}, on_error: function(response){}, on_ready_state_change: function(parameters) {
                var self = this;
                var transport = self.transport;
                var ready_state = transport.readyState;
                var status;
                var json;
                var context = self.context || self;
                if (ready_state !== 4) {
                    return null
                }
                try {
                    status = transport.status
                }
                catch(e) {
                    return null
                }
                if (status !== 200) {
                    return null
                }
                var response_text = transport.responseText;
                try {
                    json = new Function('return (' + response_text + ')')();
                    self.on_success.call(context, json)
                }
                catch(e) {
                    self.on_error.call(context, e)
                }
            }
    };
    NODUS.request = ajax
})(NODUS, window, document);