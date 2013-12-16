

window.WEB_SOCKET_DEBUG=1;

    alert("navigator.userAgent:"+navigator.userAgent);
    
    /*
    var isIOS = ((navigator.userAgent.match(/iPhone/i) != null) ||
        (navigator.userAgent.match(/iPod/i) != null) ||
        (navigator.userAgent.match(/iPad/i) != null));
    */

    /*
    if (navigator.userAgent.math(/Android/i)) {
        alert("Android device");
    } else if (navigator.userAgent.match(/Chrome/i)) {
        alert("Chrome device");
    } else if ((navigator.userAgent.match(/iPhone/i)) ||
        (navigator.userAgent.match(/iPod/i)) ||
        (navigator.userAgent.match(/iPad/i))) {
        alert("IOS device");
    };
    */

 if (window.WebSocket) {
    alert("window.WebSocket");
  } else if (window.MozWebSocket) {
    // Firefox.
    alert("window.MozWebSocket");
  } else {

    alert("window.OtherSocket");

    }

    var host = document.location.hostname;
    var port = document.location.port;

    function start_novnc(){

        alert("hostname:"+document.location.hostname+"=port:"+document.location.port);


    // If there are at least two colons in there, it is likely an IPv6 address. Check for square brackets and add them if missing.
    if(host.search(/^.*:.*:.*$/) != -1) {
       if(host.charAt(0) != "[")
          host = "[" + host;
       if(host.charAt(host.length-1) != "]")
          host = host + "]";
    }
            window.WebSocket = window.WebSocket || window.MozWebSocket;
            if (!window.WebSocket){
                    console.log("WebSocket not supported by this browser");
                    
            }
    open("novnc/vnc.html?host=" + host + "&port=" + port + "&true_color=1");
    }

    function start_vnc_view() {

        open("java-applet/VncApplet.html?host="+host+"&port="+port);

    }

    function start_chat()
    {
        var host = document.location.hostname;
    // If there are at least two colons in there, it is likely an IPv6 address. Check for square brackets and add them if missing.
    if(host.search(/^.*:.*:.*$/) != -1) {
       if(host.charAt(0) != "[")
          host = "[" + host;
       if(host.charAt(host.length-1) != "]")
          host = host + "]";
    }
    console.log("index vnc====host:"+host);
        open("novnc/chat.html?host=" + host + "&port=$PORT");
    }

