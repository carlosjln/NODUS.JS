/*!
 * NODUS.JS - v1.0.0
 * Front-End API for NODUS
 * https://github.com/carlosjln/NODUS.JS
 *
 * Author: Carlos J. Lopez
 * https://github.com/carlosjln
 */

( function( window, document ) {
	var node_collection = {};
	var raw_node_collection = {};

	var node_actions_collection = {};
	var node_handlers_collection = {};

	var requested = {};

	var shared_context = {};
	var cached_views = {};
	var validated_nodes = {};

	function NODUS() {

	}

	// REQUEST NODE DATA
	var request_node_data = ( function(  ) {
		
		function request_data( node_id, callback, data ) {
			( requested[ node_id ] = ( requested[ node_id ] || { data: false, handlers: false } ) ).data = true;

			var context = {
				validate: validate_node,

				node_id: node_id,
				callback: callback,
				data: data,

				parse_reply: NODUS.parse_reply
			};

			AJAX( {
				url: node_id,
				context: context,

				before_request: before_request,
				on_success: on_success,
				on_error: default_exception_handler
			} );
		}

		function before_request() {
			///#DEBUG
			console.log( "Requesting data for node { id='" + this.node_id + "' }" );
			///#ENDDEBUG
		}

		function on_success( response ) {
			var self = this;
			var node_id = self.node_id;
			var reply = NODUS.parse_reply( response );
			
			if( reply.has_errors() ) {
				return self.exception_handler( reply.exceptions );
			}

			update_node( node_id, reply.data );

			return validate_node_handlers( node_id, self.callback, self.data );
		}
		
		return request_data;
	} )();	

	// REQUEST NODE ACTION HANDLERS
	var request_action_handlers = (function(){
		function request_handlers( node_id, callback, data ) {
			requested[ node_id ].handlers = true;

			var context = {
				node_id: node_id,
				callback: callback,
				data: data,

				parse_reply: NODUS.parse_reply,
				exception_handler: default_exception_handler
			};

			AJAX( {
				url: node_id + "/handlers",

				context: context,

				before_request: before_request,
				on_success: on_success,
				on_error: default_exception_handler
			} );
		}

		function before_request(  ) {
			///#DEBUG
			var node = node_collection[ this.node_id ];
			console.log( "Requesting action handlers for Node{ name=" + node.name + " id=" + node.id + " }" );
			///#ENDDEBUG
		}

		function on_success( response ) {
			var self = this;
			var reply = self.parse_reply( response );

			if( reply.has_errors() ) {
				return self.exception_handler( reply.exceptions );
			}

			set_handlers( self.node_id, reply.data );

			return self.callback( self.node_id, self.data );
		}
		
		return request_handlers;
	} )();

	// REQUEST NODE VIEW
	var get_view = ( function() {
		function request_view( node_id, data ) {
			var node = node_collection[ node_id ];

			var handlers = node_handlers_collection[ node_id ];
			var view_handler = handlers[ "view" ] || { is_empty: true };
			var on_exception = view_handler.on_exception || handlers.on_exception || default_exception_handler;
			
			var proceed;

			if( view_handler.is_empty ) {
				var exception = new ApplicationException( "The Node [" + node.name + "] does not have a view handler." );
				return on_exception.call( handlers, exception, data );
			}

			// NODE HANDLERS
			var before_request = view_handler.before_request || function() {
				return true;
			};

			try {
				proceed = before_request.call( view_handler, data );
			} catch( exception ) {
				return on_exception.call( view_handler, exception, data );
			}

			if( proceed ) {
				var on_success = view_handler.on_success || function() {
					throw new Error( "Handle.view.on_success is undefined." );
				};

				var context = {
					node: node,
					NODE: Node,

					view_handler: view_handler,
					on_success: on_success,
					on_exception: on_exception
				};

				var cached_view = cached_views[ node_id ];
				if( cached_view ) {
					return on_ajax_success.call( view_handler, cached_view );
				}

				AJAX( {
					url: node_id + "/view/",
					context: context,

					before_request: before_ajax_request,
					on_success: on_ajax_success,
					on_error: on_exception
				} );
			}

			return node;
		}

		function before_ajax_request() {
			///#DEBUG
			var node = this.node;
			console.log( "Requesting view for Node{ name=" + node.name + " id=" + node.id + " }" );
			///#ENDDEBUG
		}

		function on_ajax_success( response ) {
			var self = this;
			var reply = NODUS.parse_reply( response );
			
			if( reply.has_errors() ) {
				return self.on_application_exception.call( self.view_handler, reply.exceptions );
			}

			var view = reply.data;
			var style_id = "view_" + self.node.id;

			if( view.cache ) {
				cached_views[ self.node.id ] = view;
			}

			// ONLY ADD THE VIEW CSS IF IT DOES NOT EXISTS
			if( document.getElementById( style_id ) === null ) {
				NODUS.create_style( view.style ).id = style_id;
			}

			try {
				self.on_success.call( self.view_handler, view, self.data );
			} catch( on_success_exception ) {
				self.on_exception.call( self.view_handler, new ApplicationException( on_success_exception ) );
			}
		}
		
		return request_view;
	} )();
	
	// NODE CLASS
	function Node( object ) {
		// USE CASES
		// new Node( Node ), Node( Node )
		if( object instanceof Node ) {
			return object;
		}

		// USE CASES
		// new Node( "node id" ), Node( "node id" )
		if( typeof object === "string" ) {
			return new Node( { id: object } );
		}

		var self = this;
		var node_id = object.id;

		// USE CASE
		// new Node( any )
		if( self instanceof Node ) {
			// EXPOSE NODE ID
			self.id = node_id;

			return self;
		}

		return null;
	}

	Node.prototype = {
		// USE CASES
		// Node( ... ).exec( "action_name" )
		// Node( ... ).exec( "action_name", "property=value&..." )
		// Node( ... ).exec( "action_name", "property=value&...", { data } )
		// Node( ... ).exec( "action_name", { data } )
		exec: function( action_name, query, data ) {
			var action = this[ action_name ];

			if( typeof action === "function" ) {
				if( query && typeof query === "object" ) {
					data = query;
					query = null;
				}

				execute_action( action.id, query, data );
			} else {
				///#DEBUG
				console.log( new Error( "The action '" + action_name + "' is undefined." ) );
				///#ENDDEBUG
			}
		}
	};

	Node.view = function( object, data ) {
		object = typeof object  === "string" ? object : object.id;
		validate_node( object, get_view, data );
	};

	// UTILITIES
	function register_node( node ) {
		var id = node.id;

		if( node_collection[ id ] instanceof Node ) {
			return null;
		}

		requested[ id ] = {
			data: false,
			handlers: false
		};

		node_collection[ id ] = node;
	}
	
	function update_node( node_id, data ) {
		var node = node_collection[ node_id ];

		if( ( node instanceof Node ) === false ) {
			///#DEBUG
			console.log( new Error( "The node { id='" + node_id + "' } cannot be updated." ) );
			console.log( node );
			///#ENDDEBUG
			return null;
		}

		node.name = data.name;
		node.caption = data.caption;
		node.parent_id = data.parent_id;

		raw_node_collection[ node_id ] = data;

		set_handlers( node_id, data[ "handlers" ] );
		set_actions( node_id, data[ "actions" ] );

		return node;
	}

	function set_handlers( node_id, raw_handlers ) {
		var node = node_collection[ node_id ];

		if( ( node instanceof Node ) === false || raw_handlers === null || raw_handlers === "" ) {
			return null;
		}

		var handlers = {};
		var context = {
			node: node,
			handlers: handlers,
			shared: shared_context
		};

		try {
			new Function( "context", "window", raw_handlers )( context, window );
		} catch( exception ) {
			throw exception;
		}

		node_handlers_collection[ node_id ] = handlers;

		return node;
	}

	function set_actions( node_id, raw_actions ) {
		raw_actions = raw_actions || [];

		var node = node_collection[ node_id ];
		var i = raw_actions.length;

		if( ( node instanceof Node ) === false ) {
			return null;
		}

		while( i-- ) {
			var raw_action = raw_actions[ i ];

			var action_id = raw_action.id;
			var action_name = raw_action.name;
			var method = ( function( id ) {
				return function( data ) {
					execute_action( id, null, data );
				};
			} )( action_id );

			// NEW OBJECT IS DEFINED TO PRESERVE THE ORIGINAL
			var action = {
				id: action_id,
				name: action_name,
				node_id: node_id,
				method: method
			};

			// FACILITATE NODE ID TO Node(...).exec()
			method.id = action_id;

			node[ action_name ] = method;

			node_actions_collection[ action_id ] = action;
		}

		return node;
	}
	
	// NODE VALIDATION STEP 1
	function validate_node( node_id, callback, data ) {
		///#DEBUG
		console.log( "Validating node { id='" + node_id + "' }" );
		///#ENDDEBUG

		if( typeof node_id !== "string" ) {
			///#DEBUG
			console.log( new Error( "The [node id] must be a string GUID" ) );
			console.log( "Instead received:", node_id );
			///#ENDDEBUG
			return null;
		}

		// CRITICAL
		register_node( Node( node_id ) );

		return validate_node_data( node_id, callback, data );
	}

	// NODE VALIDATION STEP 2
	// ENSURE THE NODE DATA HAVE BEEN REQUESTED AND IS AVAILABLE
	function validate_node_data( node_id, callback, data ) {
		var data_is_avaliable = requested[ node_id ] !== undefined && requested[ node_id ].data === true;
		var method = data_is_avaliable ? validate_node_handlers : request_node_data;

		return method( node_id, callback, data );
	}

	// NODE VALIDATION STEP 3
	// ENSURE NODE HANDLERS ARE AVAILABLE
	function validate_node_handlers( node_id, callback, data ) {
		///#DEBUG
		console.log( "Validating node handlers { id='" + node_id + "' }" );
		///#ENDDEBUG

		if( requested[ node_id ].handlers === false ) {
			return request_action_handlers( node_id, callback, data );
		}

		// FINALLY REGISTER THE NODE AFTER ALL REQUIREMENTS HAVE BEEN MET
		validated_nodes[ node_id ] = node_collection[ node_id ];

		return callback( node_id, data );
	}

	function execute_action( action_id, query, data ) {
		if( action_id === null ) {
			///#DEBUG
			console.log( "The action_id can't be null." );
			///#ENDDEBUG
			return null;
		}

		query = query || "";
		data = data || {};

		var action = node_actions_collection[ action_id ];
		var node_id = action.node_id;

		if( validated_nodes[ node_id ] === null ) {
			return validate_node( node_id, function() {
				execute_action( action_id, query, data );
			} );
		}

		var action_name = action.name;

		var node_handlers = node_handlers_collection[ node_id ];
		var action_handler = node_handlers.actions[ action_name ] || { is_empty: true };
		var on_success = action_handler.on_success;

		var before_request = action_handler.before_request || function() {
			return true;
		};

		var get_query = action_handler.get_query || function() {
			return "";
		};

		var on_exception = action_handler.on_exception || node_handlers.actions.on_exception || node_handlers.on_exception || default_exception_handler;
		var continue_request;

		// REQUIREMENTS CHECKPOINT
		if( action_handler.is_empty ) {
			console.log( new Error( "The action '" + action_name + "' is not defined on the handler." ) );
			return false;
		}

		if( on_success === undefined ) {
			console.log( new Error( "The method 'Handle.action." + action_name + ".on_success' is undefined." ) );
			return false;
		}

		try {
			continue_request = before_request.call( action_handler, data );
		} catch( exception ) {
			return on_exception.call( action_handler, exception );
		}

		if( continue_request ) {
			// QUERY STRING SPECIFIED OVER DIRECT CALL WILL BE PREFERED OVER GET QUERY METHOD
			query = query || get_query.call( action_handler, data );
			var query_string = 'query=' + encodeURIComponent( NODUS.encode_base64( query ) );

			var context = {
				query: query,
				
				action_name: action_name,
				action_handler: action_handler,
				
				on_success: on_success,
				on_exception: on_exception
			};

			AJAX( {
				url: 'action/' + action_id,
				method: "POST",
				send: query_string,

				context: context,

				before_request: ajax_before_request,
				on_success: ajax_on_success,
				on_error: on_exception
			} );
		}
	}

	function ajax_before_request( ) {
		///#DEBUG
		console.log( "Executing action '{" + this.action_name + "}' with params:", this.query || null );
		///#ENDDEBUG
	}

	function ajax_on_success( response ) {
		var reply = NODUS.parse_reply( response );
		var self = this;

		if( reply.has_errors() ) {
			return self.on_exception.call( self.action_handler, reply.exceptions );
		}

		try {
			self.on_success.call( self.action_handler, reply, self.data );
		} catch( exception ) {
			self.on_exception.call( self.action_handler, new ApplicationException( exception ) );
		}
	}

	// AJAX REQUEST

	function AJAX( options ) {
		options.url = "node/" + options.url;
		options.on_error = options.on_error || default_exception_handler;

		NODUS.request( options );
	}

	// EXCEPTIONS HANDLING
	function default_exception_handler( exception ) {
		console.log( "ApplicationException: ", exception );
	}

	function ApplicationException( exception ) {
		var self = this;

		exception = typeof exception === 'string' ? { message: exception } : exception;

		self.validation = [];
		self.application = [{
			name: 'ApplicationException',
			message: exception ? exception.message : ''
		}];
	}

	// DOCUMENT EVENT HANDLERS

	function document_click_handler( e ) {
		var element = ( e.target || e.srcElement ) || document;

		var node_id = get_attribute( element, "node-id" );
		var action_id = get_attribute( element, "action-id" );

		if( node_id || action_id ) {
			e.preventDefault();
			element.blur();
		}

		if( node_id ) {
			Node.view( node_id );
		} else if( action_id ) {
			execute_action( action_id );
		}
	}

	function get_attribute( element, name ) {
		var node_id = element.getAttribute( name );
		var parent_node;

		if( node_id === undefined && ( parent_node = element.parentNode ) ) {
			node_id = parent_node.getAttribute( name );
		}

		return node_id;
	}

	// SET DOCUMENT CLICK HANDLER
	// This avoids the need to set a specific handler for each button that is rendered on the UI
	if( document.addEventListener ) {
		document.addEventListener( "click", document_click_handler, false );
	} else {
		document.attachEvent( "onclick", document_click_handler );
	}

	NODUS.Node = Node;

	window.NODUS = NODUS;
	window.Node = Node;

} )( window, document );