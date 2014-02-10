( function( NODUS, window, document ) {

	// BUILD NODE TREE
	function build_node_tree( node_list ) {
		var modules = {};
		var nodes = node_list.slice( 0 );

		build_tree( modules, nodes );

		return modules;
	}

	function build_tree( parent, nodes ) {
		var parent_id = parent.id;
		var i = nodes.length;
		var node;

		while( i-- ) {
			node = new Node( nodes[ i ] );

			if( node.parent_id === parent_id ) {
				parent[ node.name ] = node;
				build_tree( node, nodes );
			}
		}
	}

	// REPLY
	function parse_reply( object ) {
		var exceptions = object.exceptions;

		exceptions.validation = filter( exceptions, function( e ) {
			return e.type === "Validation";
		} );

		exceptions.application = filter( exceptions, function( e ) {
			return e.type === "Application";
		} );

		exceptions.system = filter( exceptions, function( e ) {
			return e.type === "System";
		} );

		object.has_errors = function() {
			return this.exceptions.length > 0;
		};

		return object;
	}

	// OBJECT TYPE VERIFICATION
	// TAKEN FROM https://github.com/carlosjln/epic
	var get_type = ( function() {
		var core_types = {
			'[object Boolean]': 'boolean',
			'[object Number]': 'number',
			'[object String]': 'string',
			'[object Function]': 'function',
			'[object Array]': 'array',
			'[object Date]': 'date',
			'[object RegExp]': 'regexp',
			'[object Object]': 'object',
			'[object Error]': 'error'
		};

		var to_string = core_types.toString;

		function type( object ) {
			var typeof_object = typeof( object );

			if( object === null ) {
				return 'null';
			}

			if( typeof_object === 'object' || typeof_object === 'function' ) {
				return core_types[ to_string.call( object ) ] || 'object';
			}

			return typeof_object;
		}

		return type;
	} )();

	var request = ( function( window, undefined ) {
		
		var get_transport = window.XMLHttpRequest ?
			function() { return new XMLHttpRequest(); } :
			function() { return new ActiveXObject( "Microsoft.XMLHTTP" ) };

		function ajax( settings ) {
			if( (this instanceof ajax) == false ) {
				return new ajax( settings );
			}

			var t = this;
			var transport = t.transport = get_transport();
			
			var typeof_default_property;
			var value;
			
			// COPY ALL PROPERTIES OF SETTING THAT MATCH THE SAME TYPE PROPERTY NAME AND TYPE ON THE REQUEST INSTANCE
			for( var property in settings ) {
				typeof_default_property = get_type( t[ property ] );
				value = settings[ property ];
				
				if(  settings.hasOwnProperty(property) && (typeof_default_property === "undefined" || typeof_default_property === get_type(value) )) {
					t[ property ] = value;
				}
			}
			
			var method = t.method;
			var get_method = "GET";
			var post_method = "POST";
			
			transport.open( method, t.url, true );
			
			transport.onreadystatechange = function(  ) {
				t.on_ready_state_change.call( t );
			};
			
			if( method == post_method ){
				transport.setRequestHeader('Content-type', 'application/x-www-form-urlencoded');
			}
			
			transport.send( t.send );
		}

//		ajax.request = {
//			method: {
//				GET: "GET",
//				POST: "POST"
//			}
//		};
		
		// DEFAULT SETTINGS ;)
		ajax.prototype = {
			url: "",
			method: "GET",
			
			on_complete: function( response ) {
				
			},
			
			on_success: function( response ) {
				
			},
			
			on_error: function( response ) {
				
			},
			
			// DON'T OVERRIDE THESE UNLESS YOU KNOW WHAT YOU ARE MESSING WITH :P
			on_ready_state_change: function( parameters ) {
				var transport = this.transport;
				var ready_state = transport.readyState;
				var status;
				
				// READY STATE AND STATUS CHECK
				if( ready_state !== 4 ) {
					return null;
				}
				
				try {
					status = transport.status;
				} catch ( e ) {
					return null;
				}
				
				if( status !== 200 ) {
					return null;
				}
				
				// PROCESS
				var response_text = transport.responseText;
				
				console.log( response_text );
			},
			
			get_error: function ( number, message ){
//				var msg = null;
				
				// CUSTOM ERROR
//				if( number === 0 ) msg = message;
//				if( number === 1 ) msg = "JavaScript error";
//				if( number === 2 ) msg = "Timeout expired";
//				if( number === 3 ) msg = "Invalid JSON";
//				if( number === 4 ) msg = "Error on complete";
//				if( number === 5 ) msg = "Error on fail'";
//				if( number === 6 ) msg = "Request aborted";
//
//				if( number === 204 ) msg = "No Content";
//				if( number === 400 ) msg = "Bad Request";
//				if( number === 401 ) msg = "Unauthorized";
//				if( number === 403 ) msg = "Forbidden";
//				if( number === 404 ) msg = "File Not Found";
//				if( number === 500 ) msg = "Server side error";
//		
//				if( number > 0 && msg === '' ) msg = "Unknown error";
//				
//				return {
//					number: parseInt( number, 10),
//					message: msg
//				};
			},
		};
		
		return ajax;
	} )( window );

	// COPYCAT ENGINE B-)
	// TAKEN FROM https://github.com/carlosjln/epic
	function copy( object, target ) {
		var object_type = get_type( object );
		var clone;

		switch( object_type ) {
		case "object":
			clone = target || {};

			for( var attribute in object ) {
				if( object.hasOwnProperty( attribute ) ) {
					clone[ attribute ] = copy( object[ attribute ] );
				}
			}

			break;
		case "array":
			clone = target || [];

			for( var i = 0, len = object.length; i < len; i++ ) {
				clone[ i ] = copy( object[ i ] );
			}

			break;
		case "date":
			clone = new Date();
			clone.setTime( object.getTime() );
			break;
		// HANDLE PRIMITIVE TYPES: "null", "number", "boolean", "string" "function"
		default:
			clone = object;
		}

		return clone;
	}

	function merge() {
		var objects = arguments;
		var length = objects.length;
		var target = {};
		var i = 0;

		for( ; i < length; i++ ) {
			copy( objects[ i ], target );
		}

		return target;
	}

	// ENCODE/DECODE BASE64
	// TAKEN FROM https://github.com/carlosjln/epic
	var B64KEY = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";

	function encode_base64( input ) {
		var key = B64KEY;

		var str = encode_utf8( input );
		var length = str.length;
		var index = 0;

		var output = "";
		var chr1, chr2, chr3, enc1, enc2, enc3, enc4;

		while( index < length ) {
			chr1 = str.charCodeAt( index++ );
			chr2 = str.charCodeAt( index++ );
			chr3 = str.charCodeAt( index++ );

			enc1 = chr1 >> 2;
			enc2 = ( ( chr1 & 3 ) << 4 ) | ( chr2 >> 4 );
			enc3 = ( ( chr2 & 15 ) << 2 ) | ( chr3 >> 6 );
			enc4 = chr3 & 63;

			if( isNaN( chr2 ) ) {
				enc3 = enc4 = 64;
			} else if( isNaN( chr3 ) ) {
				enc4 = 64;
			}

			output = output + key.charAt( enc1 ) + key.charAt( enc2 ) + key.charAt( enc3 ) + key.charAt( enc4 );
		}

		return output;
	}

	function encode_utf8( input ) {
		var str = input.replace( /\r\n/g, "\n" );
		var length = str.length;
		var index = 0;

		var output = "";
		var charcode;

		while( length-- ) {
			charcode = str.charCodeAt( index++ );

			if( charcode < 128 ) {
				output += String.fromCharCode( charcode );
			} else if( ( charcode > 127 ) && ( charcode < 2048 ) ) {
				output += String.fromCharCode( ( charcode >> 6 ) | 192 );
				output += String.fromCharCode( ( charcode & 63 ) | 128 );
			} else {
				output += String.fromCharCode( ( charcode >> 12 ) | 224 );
				output += String.fromCharCode( ( ( charcode >> 6 ) & 63 ) | 128 );
				output += String.fromCharCode( ( charcode & 63 ) | 128 );
			}
		}

		return output;
	}

	function create_style( css ) {
		var style = document.createElement( "style" );
		style.setAttribute( "type", "text/css" );

		if( style.styleSheet ) { // IE
			style.styleSheet.cssText = css;

		} else { // the world
			style.insertBefore( document.createTextNode( css ), null );
		}

		document.getElementsByTagName( 'head' )[ 0 ].insertBefore( style, null );

		return style;
	}

	function filter( list, condition ) {
		var length = list.length;
		var i = 0;
		
		var result = [];
		var item;
		
		for(; i < length; i++ ) {
			item = list[i];
			if( condition( item ) ) {
				result[ result.length ] = item;
			}
		}
		
		return result;
	}

	NODUS.build_node_tree = build_node_tree;
	NODUS.parse_reply = parse_reply;
	NODUS.merge = merge;
	NODUS.encode_base64 = encode_base64;
	NODUS.encode_utf8 = encode_utf8;
	NODUS.request = request;

} )( NODUS, window, document );