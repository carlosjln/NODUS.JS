var NODUS;
( function( NODUS, window, document ) {
	var get_type = NODUS.get_type;
	var get_transport = window.XMLHttpRequest ?
		function() { return new XMLHttpRequest(); } :
		function() { return new ActiveXObject( "Microsoft.XMLHTTP" ); };

	function ajax( settings ) {
		if( ( this instanceof ajax ) === false ) {
			return new ajax( settings );
		}

		var self = this;
		var transport = self.transport = get_transport();

		var typeof_default_property;
		var value;

		// COPY ALL PROPERTIES OF SETTING THAT MATCH THE SAME TYPE PROPERTY NAME AND TYPE ON THE REQUEST INSTANCE
		for( var property in settings ) {
			typeof_default_property = get_type( self[ property ] );
			value = settings[ property ];

			if( settings.hasOwnProperty( property ) && ( typeof_default_property === "undefined" || typeof_default_property === get_type( value ) ) ) {
				self[ property ] = value;
			}
		}

		var method = self.method;
		// var get_method = "GET";
		var post_method = "POST";
		var context = self.context || self;

		// EXECUTE CALL BACK WITH THE SPECIFIED CONTEXT OR XHR INSTANCE AS CONTEXT
		self.before_request.call( context, self, settings );

		transport.open( method, self.url, true );

		transport.onreadystatechange = function(  ) {
			self.on_ready_state_change.call( self );
		};

		if( method === post_method ) {
			transport.setRequestHeader( 'Content-type', 'application/x-www-form-urlencoded' );
		}

		transport.send( self.send );
	}

	// DEFAULT SETTINGS ;)
	ajax.prototype = {
		constructor: ajax,
		
		url: "",
		method: "GET",

		before_request: function( xhr, settings ) {

		},

		on_complete: function( response ) {

		},

		on_success: function( response ) {

		},

		on_error: function( response ) {

		},
			
		// DON'T OVERRIDE THESE UNLESS YOU KNOW WHAT YOU ARE MESSING WITH :P
		on_ready_state_change: function( parameters ) {
			var self = this;
			var transport = self.transport;
			var ready_state = transport.readyState;
			var status;
			var json;
			var context = self.context || self;

			// READY STATE AND STATUS CHECK
			if( ready_state !== 4 ) {
				return null;
			}

			try {
				status = transport.status;
			} catch( e ) {
				return null;
			}

			if( status !== 200 ) {
				return null;
			}

			// PROCESS
			var response_text = transport.responseText;

			try {
				json = new Function( 'return (' + response_text + ')' )();
				self.on_success.call( context, json );

			} catch( e ) {
				self.on_error.call( context, e );
			}
		}
	};
	
	NODUS.request = ajax;

} )( NODUS, window, document );