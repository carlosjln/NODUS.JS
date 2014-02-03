
( function( window, document ) {
	var node_collection = {};
	var raw_node_collection = {};

	var node_actions_collection = {};
	var node_handlers_collection = {};

	var requested = {};

	var shared_context = {};
	var cached_views = {};
	var validated_nodes = {};

	function NODUS() {}

	// NODE CLASS
	function Node( object ) {
		// USE CASES
		// new Node( Node ), Node( Node )
		if( object instanceof Node ) {
			return object;
		}

		// USE CASES
		// new Node( "node id" ), Node( "node id" )
		if( typeof object == "string" ) {
			return new Node( { id: object } );
		}

		var self = this;
		var node_id = object.id;
		
		// TODO: VALIDATE IF NODE ID IS NOT PRESENT IN THE NODE COLLECTION NOR ON REQUESTED COLLECTION

		var existing_node = node_collection[ node_id ];
		if( existing_node ) {
			return existing_node;
		}

		var requested_node = requested[ node_id ];
		if( requested_node ) {
			console.log( "Node{ id=" + node_id + "} was requested, but not registered on the node collection." );
			return null;
		}

		// USE CASE
		// new Node( any )
		if( self instanceof Node ) {
			// EXPOSE NODE ID
			self.id = node_id;

			requested[ node_id ] = {
				data: false,
				handlers: false
			};

			// REGISTER NEW NODE
			node_collection[ node_id ] = self;

			update_node_data( node_id, object );

			return this;
		}

		return null;
	}

	Node.prototype = {
		view: function( data ) {
			var self = this;
			var callback = function() {
				get_view( self, data );
			};

			validate( self, callback );

			return self;
		},

		// USE CASES
		// Node( ... ).exec( "action_name" )
		// Node( ... ).exec( "action_name", "property=value&..." )
		// Node( ... ).exec( "action_name", "property=value&...", { data } )
		// Node( ... ).exec( "action_name", { data } )
		exec: function( action_name ) {
			var action = this[ action_name ];

			if( action ) {
				var params = Array.prototype.slice.call( arguments );
				var query = params[1];
				var data = params[2];

				if( query && typeof query == "object" ) {
					data = query;
					query = null;
				}

				var options = {
					action_id: action.id,
					query: query,
					data: data
				};

				execute_action( options );
			} else {
				///#DEBUG
				console.log( "EXCEPTION: The action '" + action_name + "' is undefined." );
				///#ENDDEBUG
			}
		}
	};
		
	Node.update = function( node_id, data ) {
		update_node_data( node_id, data );
	};
	
	NODUS.Node = Node;

	function update_node_data( node_id, data ) {
		// CREATE A NEW NODE IF ONE DOES NOT EXIST ON LOCAL COLLECTION
		var node = node_collection[ node_id ] || new Node( node_id );

		node.name = data.name;
		node.caption = data.caption;
		node.parent_id = data.parent_id;

		raw_node_collection[ node_id ] = data;

		set_handlers( node, data[ "handlers" ] );
		set_actions( node, data[ "actions" ] );
	}

	function set_handlers( node, raw_handlers ) {
		if( raw_handlers == null || raw_handlers == "" ) {
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

		node_handlers_collection[ node.id ] = handlers;
	}

	function set_actions( node, raw_actions ) {
		raw_actions = raw_actions || [];

		var node_id = node.id;
		var i = raw_actions.length;

		while( i-- ) {
			var raw_action = raw_actions[ i ];

			var action_id = raw_action.id;
			var action_name = raw_action.name;
			var method = ( function( id ) {
				return function( data ) {
					execute_action( {
						action_id: id,
						data: data
					} );
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
	}

	function validate( node, callback ) {
		if( node == null ) {
			///#DEBUG
			console.log( "The node parameter can't be null." );
			///#ENDDEBUG
			return null;
		}

		var node_id = node.id;
		var validated_node = validated_nodes[ node_id ];

		// EXECUTE THE CALLBACK IF THE NODE HAVE BEEN VALIDATED PREVIOUSLY
		if( validated_node ) {
			return callback.call( validated_node );
		}

		var resume_validation = function() {
			validate( node, callback );
		};

		// IF NODE DATA IS MISSING
		if( requested[ node_id ].data == false ) {
			return request_node_data( node, resume_validation );
		}

		// ENSURE THE NODE HANDLERS HAVE BEEN LOADED PRIOR ITS USAGE
		if( requested[ node_id ].handlers == false ) {
			return request_action_handlers( node, resume_validation );
		}

		// FINALLY REGISTER THE NODE AFTER ALL REQUIREMENTS HAVE BEEN MET
		validated_nodes[ node_id ] = node;

		callback.call( node );
	}

	function get_view( node, params ) {
		var node_id = node.id;

		var handlers = node_handlers_collection[ node_id ];
		var view_handler = handlers[ "view" ] || { is_empty: true };
		var handle_application_exception = view_handler.exception || handlers.exception || default_exception_handler;

		if( view_handler.is_empty ) {
			var exception = new ApplicationException( "The Node [" + node.name + "] does not have a view handler." );
			return handle_application_exception.call( handlers, exception );
		}

		// HANDLERS
		var before_request = view_handler.before_request || function() {
			return true;
		};
		
		var on_request = view_handler.on_request || function() {};
		
		var proceed;

		try {
			proceed = before_request.call( view_handler, params );
		} catch( exception ) {
			return handle_application_exception.call( view_handler, exception );
		}

		if( proceed ) {
			var success = build_request_success_callback( node_id, view_handler, params, handle_application_exception );

			///#DEBUG
			console.log( "Requesting view for Node{ name=" + node.name + " id=" + node_id + " }" );
			///#ENDDEBUG

			on_request.call( view_handler );

			var cached_view = cached_views[ node_id ];
			if( cached_view ) {
				return success( cached_view );
			}

			var options = {
				success: success,
				error: handle_application_exception
			};

			request( node_id + "/view/", null, options );
		}
	}

	function execute_action( options ) {
		var action_id = options.action_id;

		if( action_id == null ) {
			///#DEBUG
			console.log( "The action_id can't be null." );
			///#ENDDEBUG
			return null;
		}

		var action = node_actions_collection[ action_id ];
		var action_name = action.name;

		var node_id = action.node_id;
		var node = node_collection[ node_id ];

		if( validated_nodes[ action.node_id ] == null ) {
			return validate( node, function() {
				execute_action( options );
			} );
		}

		var query = options.query || "";
		var data = options.data || {};

		var handlers = node_handlers_collection[ action.node_id ];
		var action_handler = handlers.actions[ action_name ];

		if( action_handler == null ) {
			throw new Error( "The action '" + action_name + "' is not defined on the handler." );
		}

		var before_request = action_handler.before_request || function() {
			return true;
		};
		
		var get_query = action_handler.get_params || function() {
			return "";
		};
		
		var on_request = action_handler.on_request || function() {};

		var on_action_success = action_handler.on_success || function() {
			throw new Error( "The method 'Handle.action." + action_name + ".on_success' is undefined." );
		};

		var handle_application_exception = action_handler.exception || handlers.actions.exception || handlers.exception || default_exception_handler;
		var continue_request;

		try {
			continue_request = before_request.call( action_handler, data );
		} catch( exception ) {
			return handle_application_exception.call( action_handler, exception );
		}

		if( continue_request ) {
			var on_success = function( response ) {
				var reply = NODUS.parse_reply( response );

				if( reply.has_errors() ) {
					return handle_application_exception.call( action_handler, reply.exceptions );
				}

				try {
					on_action_success.call( action_handler, reply, data );
				} catch( on_succeess_exception ) {
					handle_application_exception( new ApplicationException( on_succeess_exception ) );
				}
			};

			// QUERY STRING SPECIFIED OVER DIRECT CALL WILL BE PREFERED OVER GET QUERY METHOD
			query = query || get_query.call( action_handler, data );
			var query_string = 'query=' + encodeURIComponent( NODUS.encode_base64( query ) );

			///#DEBUG
			console.log( "Executing action '{0}' with params:".format( action_name ), query || null );
			///#ENDDEBUG

			on_request.call( action_handler, data );

			var request_options = {
				success: on_success,
				error: handle_application_exception
			};

			request( 'action/' + action_id, query_string, request_options );
		}
	}

	// UTILITY METHODS
	function request_node_data( node, callback ) {
		var node_id = node.id;

		requested[ node_id ].data = true;

		///#DEBUG
		console.log( "Requesting data for Node{ name=" + node.name + " id=" + node_id + " }" );
		///#ENDDEBUG

		var options = {
			success: function( response ) {
				var reply = NODUS.parse_reply( response );

				if( reply.has_errors() ) {
					return default_exception_handler( reply.exceptions );
				}

				Node.update( node_id, reply.data );

				return callback();
			}
		};

		request( node_id, null, options );
	}

	function request_action_handlers( node, callback ) {
		var node_id = node.id;

		requested[ node_id ].handlers = true;

		///#DEBUG
		console.log( "Requesting action handlers for Node{ name=" + node.name + " id=" + node_id + " }" );
		///#ENDDEBUG

		var options = {
			success: function( response ) {
				var reply = NODUS.parse_reply( response );

				if( reply.has_errors() ) {
					return default_exception_handler( reply.exceptions );
				}

				set_handlers( node, reply.data );

				callback();
			}
		};

		request( node_id + "/handlers", null, options );
	}

	function build_request_success_callback( node_id, view_handler, params, handle_application_exception ) {
		
		var view_handler_on_success = view_handler.on_success || function() {
			throw new Error( "Handle.view.on_success is undefined." );
		};

		return function( response ) {
			var reply = NODUS.parse_reply( response );

			if( reply.has_errors() ) {
				return handle_application_exception( reply.exceptions );
			}

			var view = reply.data;
			var style_id = "view_" + node_id;

			if( view.cache ) {
				cached_views[ node_id ] = view;
			}

			// ONLY ADD THE VIEW CSS IF IT DOES NOT EXISTS
			if( document.getElementById( style_id ) == null ) {
				NODUS.create_style( view.style ).id = style_id;
			}

			try {
				view_handler_on_success.call( view_handler, view, params );
			} catch( on_success_exception ) {
				handle_application_exception.call( view_handler, new ApplicationException( on_success_exception ) );
			}
		};
	}

	function request( url, data, options ) {
		var handle_exception = options.exception || default_exception_handler;

		var request_options = {
			type: 'POST',
			dataType: "json",
			data: data,
			error: function( exception ) {
				handle_exception.call( {}, new ApplicationException( exception ) );
			}
		};

		NODUS.merge( request_options, options );

		NODUS.ajax( "node/" + url, request_options );
	}

	function default_exception_handler( exception ) {
		console.log( "ApplicationException: ", exception );
	}

	// EXCEPTIONS
	function ApplicationException( exception ) {
		exception = typeof exception == 'string' ? { message: exception } : exception;

		this.validation = [];
		this.application = [{
			name: 'ApplicationException',
			message: exception ? exception.message : ''
		}];
	}

	function document_click_handler( e ) {
		var element = $( e.target );

		var node_id = get_node_id( element );
		var action_id = get_action_id( element );

		if( node_id || action_id ) {
			e.preventDefault();
			element.blur();
		}

		if( node_id ) {
			new Node( node_id ).view();
		} else if( action_id ) {
			execute_action( { action_id: action_id } );
		} else {
		}
	}

	function get_node_id( element ) {
		return element.attr( "node-id" ) || element.parent( "[ node-id ]" ).attr( "node-id" );
	}

	function get_action_id( element ) {
		return element.attr( "action-id" ) || element.parent( "[ action-id ]" ).attr( "action-id" );
	}

	// SET DOCUMENT CLICK HANDLER
	// This avoids the need to set a specific handler for each button that is rendered on the UI
	$( window.document ).click( document_click_handler );
	window.NODUS = NODUS;
	window.Node = Node;
} )( window, document );