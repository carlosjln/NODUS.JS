NODUS.JS - Building awesome web applications :) 
===  

This is the JavaScript API that facilitates communication with NODUS.

The following samples are provided assuming you already have followed the installation guides and tutorials  specified at [NODUS](https://github.com/carlosjln/NODUS)

## Code samples ##

**Requesting the node's view** 

    Node( node_id ).view();

Send data to the view handler

    Node( node_id ).view( {data} );

**Executing a node's action**

Simple action execution, the query string will be returned by the *get_query* method on the node handler
 
    Node( node_id ).exec( "method_name" );

Overriding the query string

    Node( node_id ).exec( "method_name", "key=value&..." );

Overriding the query string and sending data

    Node( node_id ).exec( "method_name", "key=value&...", {data} );

----------

NOTE: this is still work in progress and more clarifications and code samples will be added soon.