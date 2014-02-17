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

	// OBJECT TYPE DETECTION
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
	NODUS.create_style = create_style;
	NODUS.get_type = get_type;

} )( NODUS, window, document );