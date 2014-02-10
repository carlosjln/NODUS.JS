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
    function Node(object) {
        if (object instanceof Node) {
            return object
        }
        if (typeof object === "string") {
            return new Node({id: object})
        }
        var self = this;
        var node_id = object.id;
        var existing_node = node_collection[node_id];
        if (existing_node) {
            return existing_node
        }
        var requested_node = requested[node_id];
        if (requested_node) {
            console.log("Node{ id=" + node_id + "} was requested, but not registered on the node collection.");
            return null
        }
        if (self instanceof Node) {
            self.id = node_id;
            requested[node_id] = {
                data: false, handlers: false
            };
            node_collection[node_id] = self;
            update_node_data(node_id, object);
            return this
        }
        return null
    }
    Node.prototype = {
        view: function(data) {
            var self = this;
            var callback = function() {
                    get_view(self, data)
                };
            validate(self, callback);
            return self
        }, exec: function(action_name) {
                var action = this[action_name];
                if (action) {
                    var params = Array.prototype.slice.call(arguments);
                    var query = params[1];
                    var data = params[2];
                    if (query && typeof query === "object") {
                        data = query;
                        query = null
                    }
                    var options = {
                            action_id: action.id, query: query, data: data
                        };
                    execute_action(options)
                }
                else {}
            }
    };
    Node.update = function(node_id, data) {
        update_node_data(node_id, data)
    };
    NODUS.Node = Node;
    function update_node_data(node_id, data) {
        var node = node_collection[node_id] || new Node(node_id);
        node.name = data.name;
        node.caption = data.caption;
        node.parent_id = data.parent_id;
        raw_node_collection[node_id] = data;
        set_handlers(node, data["handlers"]);
        set_actions(node, data["actions"])
    }
    function set_handlers(node, raw_handlers) {
        if (raw_handlers === null || raw_handlers === "") {
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
        node_handlers_collection[node.id] = handlers
    }
    function set_actions(node, raw_actions) {
        raw_actions = raw_actions || [];
        var node_id = node.id;
        var i = raw_actions.length;
        while (i--) {
            var raw_action = raw_actions[i];
            var action_id = raw_action.id;
            var action_name = raw_action.name;
            var method = (function(id) {
                    return function(data) {
                            execute_action({
                                action_id: id, data: data
                            })
                        }
                })(action_id);
            var action = {
                    id: action_id, name: action_name, node_id: node_id, method: method
                };
            method.id = action_id;
            node[action_name] = method;
            node_actions_collection[action_id] = action
        }
    }
    function validate(node, callback) {
        if (node === null) {
            return null
        }
        var node_id = node.id;
        var validated_node = validated_nodes[node_id];
        if (validated_node) {
            return callback.call(validated_node)
        }
        var resume_validation = function() {
                validate(node, callback)
            };
        if (requested[node_id].data === false) {
            return request_node_data(node, resume_validation)
        }
        if (requested[node_id].handlers === false) {
            return request_action_handlers(node, resume_validation)
        }
        validated_nodes[node_id] = node;
        callback.call(node)
    }
    function get_view(node, params) {
        var node_id = node.id;
        var handlers = node_handlers_collection[node_id];
        var view_handler = handlers["view"] || {is_empty: true};
        var handle_application_exception = view_handler.exception || handlers.exception || default_exception_handler;
        if (view_handler.is_empty) {
            var exception = new ApplicationException("The Node [" + node.name + "] does not have a view handler.");
            return handle_application_exception.call(handlers, exception)
        }
        var before_request = view_handler.before_request || function() {
                return true
            };
        var on_request = view_handler.on_request || function(){};
        var proceed;
        try {
            proceed = before_request.call(view_handler, params)
        }
        catch(exception) {
            return handle_application_exception.call(view_handler, exception)
        }
        if (proceed) {
            var success = build_request_success_callback(node_id, view_handler, params, handle_application_exception);
            on_request.call(view_handler);
            var cached_view = cached_views[node_id];
            if (cached_view) {
                return success(cached_view)
            }
            request({
                url: node_id + "/view/", on_success: success, on_error: handle_application_exception
            })
        }
    }
    function execute_action(options) {
        var action_id = options.action_id;
        if (action_id === null) {
            return null
        }
        var action = node_actions_collection[action_id];
        var action_name = action.name;
        var node_id = action.node_id;
        var node = node_collection[node_id];
        if (validated_nodes[action.node_id] === null) {
            return validate(node, function() {
                    execute_action(options)
                })
        }
        var query = options.query || "";
        var data = options.data || {};
        var handlers = node_handlers_collection[action.node_id];
        var action_handler = handlers.actions[action_name];
        if (action_handler === null) {
            throw new Error("The action '" + action_name + "' is not defined on the handler.");
        }
        var before_request = action_handler.before_request || function() {
                return true
            };
        var get_query = action_handler.get_params || function() {
                return ""
            };
        var on_request = action_handler.on_request || function(){};
        var on_action_success = action_handler.on_success || function() {
                throw new Error("The method 'Handle.action." + action_name + ".on_success' is undefined.");
            };
        var handle_application_exception = action_handler.exception || handlers.actions.exception || handlers.exception || default_exception_handler;
        var continue_request;
        try {
            continue_request = before_request.call(action_handler, data)
        }
        catch(exception) {
            return handle_application_exception.call(action_handler, exception)
        }
        if (continue_request) {
            var on_success = function(response) {
                    var reply = NODUS.parse_reply(response);
                    if (reply.has_errors()) {
                        return handle_application_exception.call(action_handler, reply.exceptions)
                    }
                    try {
                        on_action_success.call(action_handler, reply, data)
                    }
                    catch(on_succeess_exception) {
                        handle_application_exception(new ApplicationException(on_succeess_exception))
                    }
                };
            query = query || get_query.call(action_handler, data);
            var query_string = 'query=' + encodeURIComponent(NODUS.encode_base64(query));
            on_request.call(action_handler, data);
            request({
                url: 'action/' + action_id, on_success: on_success, on_error: handle_application_exception
            })
        }
    }
    function request_node_data(node, callback) {
        var node_id = node.id;
        requested[node_id].data = true;
        request({
            url: node_id, on_success: function(response, node_id) {
                    var reply = NODUS.parse_reply(response);
                    if (reply.has_errors()) {
                        return default_exception_handler(reply.exceptions)
                    }
                    Node.update(node_id, reply.data);
                    return callback()
                }, parameters: [node_id]
        })
    }
    function request_action_handlers(node, callback) {
        var node_id = node.id;
        requested[node_id].handlers = true;
        request({
            url: node_id + "/handlers", on_success: function(response, node_id) {
                    var reply = NODUS.parse_reply(response);
                    if (reply.has_errors()) {
                        return default_exception_handler(reply.exceptions)
                    }
                    Node.update(node_id, reply.data);
                    return callback()
                }, parameters: [node_id]
        })
    }
    function build_request_success_callback(node_id, view_handler, params, handle_application_exception) {
        var view_handler_on_success = view_handler.on_success || function() {
                throw new Error("Handle.view.on_success is undefined.");
            };
        return function(response) {
                var reply = NODUS.parse_reply(response);
                if (reply.has_errors()) {
                    return handle_application_exception(reply.exceptions)
                }
                var view = reply.data;
                var style_id = "view_" + node_id;
                if (view.cache) {
                    cached_views[node_id] = view
                }
                if (document.getElementById(style_id) === null) {
                    NODUS.create_style(view.style).id = style_id
                }
                try {
                    view_handler_on_success.call(view_handler, view, params)
                }
                catch(on_success_exception) {
                    handle_application_exception.call(view_handler, new ApplicationException(on_success_exception))
                }
            }
    }
    function request(options) {
        options.url = "node/" + options.url;
        options.on_error = options.on_error || default_exception_handler;
        NODUS.request(options)
    }
    function default_exception_handler(exception) {
        console.log("ApplicationException: ", exception)
    }
    function ApplicationException(exception) {
        exception = typeof exception === 'string' ? {message: exception} : exception;
        this.validation = [];
        this.application = [{
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
            new Node(node_id).view()
        }
        else if (action_id) {
            execute_action({action_id: action_id})
        }
        else {}
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
    window.NODUS = NODUS;
    window.Node = Node
})(window, document);
(function(NODUS, window, document) {
    function build_node_tree(node_list) {
        var modules = {};
        var nodes = node_list.slice(0);
        build_tree(modules, nodes);
        return modules
    }
    function build_tree(parent, nodes) {
        var parent_id = parent.id;
        var i = nodes.length;
        var node;
        while (i--) {
            node = new Node(nodes[i]);
            if (node.parent_id === parent_id) {
                parent[node.name] = node;
                build_tree(node, nodes)
            }
        }
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
    var request = (function(window, undefined) {
            var get_transport = window.XMLHttpRequest ? function() {
                    return new XMLHttpRequest
                } : function() {
                    return new ActiveXObject("Microsoft.XMLHTTP")
                };
            function ajax(settings) {
                if ((this instanceof ajax) == false) {
                    return new ajax(settings)
                }
                var t = this;
                var transport = t.transport = get_transport();
                var typeof_default_property;
                var value;
                for (var property in settings) {
                    typeof_default_property = get_type(t[property]);
                    value = settings[property];
                    if (settings.hasOwnProperty(property) && (typeof_default_property === "undefined" || typeof_default_property === get_type(value))) {
                        t[property] = value
                    }
                }
                var method = t.method;
                var get_method = "GET";
                var post_method = "POST";
                transport.open(method, t.url, true);
                transport.onreadystatechange = function() {
                    t.on_ready_state_change.call(t)
                };
                if (method == post_method) {
                    transport.setRequestHeader('Content-type', 'application/x-www-form-urlencoded')
                }
                transport.send(t.send)
            }
            ajax.prototype = {
                url: "", method: "GET", on_complete: function(response){}, on_success: function(response){}, on_error: function(response){}, on_ready_state_change: function(parameters) {
                        var transport = this.transport;
                        var ready_state = transport.readyState;
                        var status;
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
                        console.log(response_text)
                    }, get_error: function(number, message){}
            };
            return ajax
        })(window);
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
    NODUS.build_node_tree = build_node_tree;
    NODUS.parse_reply = parse_reply;
    NODUS.merge = merge;
    NODUS.encode_base64 = encode_base64;
    NODUS.encode_utf8 = encode_utf8;
    NODUS.request = request
})(NODUS, window, document);