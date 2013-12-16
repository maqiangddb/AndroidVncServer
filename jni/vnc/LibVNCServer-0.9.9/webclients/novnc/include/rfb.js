/*
 * noVNC: HTML5 VNC client
 * Copyright (C) 2012 Joel Martin
 * Copyright (C) 2013 Samuel Mannehed for Cendio AB
 * Licensed under MPL 2.0 (see LICENSE.txt)
 *
 * See README.md for usage and integration instructions.
 *
 * TIGHT decoder portion:
 * (c) 2012 Michael Tinglof, Joe Balaz, Les Piech (Mercuri.ca)
 */

/*jslint white: false, browser: true, bitwise: false, plusplus: false */
/*global window, Util, Display, Keyboard, Mouse, Websock, Websock_native, Base64, DES */


function RFB(defaults) 
{
"use strict";

var that           = {},  // Public API methods
    conf           = {},  // Configuration attributes

    // Pre-declare private functions used before definitions (jslint)
    init_vars, updateState, fail, handle_message,
    init_msg, normal_msg, framebufferUpdate, print_stats,

    pixelFormat, clientEncodings, fbUpdateRequest, fbUpdateRequests,
    keyEvent, pointerEvent, clientCutText,

    getTightCLength, extract_data_uri,
    keyPress, mouseButton, mouseMove,

    checkEvents,  // Overridable for testing

    //zrle encoder
    colorDepth = 0,
    zrlePixFactor = 0,
    zrleTilePixels = [],
    BlackWhite = 0,
    Tens = 1,
    Hundreds = 2,
    Thousends = 3,
    Millions = 4,

    PIXEL_FORMAT     =
    [
        [8, 3, 0, 1, 1, 1, 1, 0, 1, 2],
        [8, 6, 0, 1, 3, 3, 3, 0, 2, 4],
        [8, 8, 0, 1, 7, 7, 3, 0, 3, 6],
        [16, 16, 0, 1, 63, 31, 31, 0, 6, 11],
        [32, 24, 0, 1, 255, 255, 255, 16, 8, 0]
    ],
    test_packed_rle = true, 
    test_plain_rle = true, 
    test_packed = true, 
    test_raw = true,


    //
    // Private RFB namespace variables
    //
    rfb_host       = '',
    rfb_port       = 5900,
    rfb_password   = '',
    rfb_path       = '',

    rfb_state      = 'disconnected',
    rfb_version    = 0,
    rfb_max_version= 3.8,
    rfb_auth_scheme= '',


    // In preference order
    encodings      = [
        ['COPYRECT',         0x01 ],
        ['ZRLE',    16],
        ['TIGHT_PNG',        -260 ],
        ['TIGHT',            0x07 ],
        ['HEXTILE',          0x05 ],
        ['RRE',              0x02 ],
        ['RAW',              0x00 ],
        ['DesktopSize',      -223 ],
        ['Cursor',           -239 ],

        // Psuedo-encoding settings
        //['JPEG_quality_lo',   -32 ],
        ['JPEG_quality_med',    -26 ],
        //['JPEG_quality_hi',   -23 ],
        //['compress_lo',      -255 ],
        ['compress_hi',        -247 ],
        ['last_rect',          -224 ]
        ],

    encHandlers    = {},
    encNames       = {}, 
    encStats       = {},     // [rectCnt, rectCntTot]

    ws             = null,   // Websock object
    display        = null,   // Display object
    keyboard       = null,   // Keyboard input handler object
    mouse          = null,   // Mouse input handler object
    sendTimer      = null,   // Send Queue check timer
    connTimer      = null,   // connection timer
    disconnTimer   = null,   // disconnection timer
    msgTimer       = null,   // queued handle_message timer

    // Frame buffer update state
    FBU            = 
    {
        rects          : 0,
        subrects       : 0,  // RRE
        lines          : 0,  // RAW
        tiles          : 0,  // HEXTILE
        bytes          : 0,
        x              : 0,
        y              : 0,
        width          : 0, 
        height         : 0,
        encoding       : 0,
        subencoding    : -1,
        background     : null,
        zlibs          : [],   // TIGHT zlib streams
        zlib_zrle       : null, //Zrle zlib stream
        zrleInStream     : null
    },

    fb_Bpp         = 4,
    fb_depth       = 3,
    fb_width       = 0,
    fb_height      = 0,
    fb_name        = "",

    last_req_time  = 0,
    rre_chunk_sz   = 100,

    timing         = {
        last_fbu       : 0,
        fbu_total      : 0,
        fbu_total_cnt  : 0,
        full_fbu_total : 0,
        full_fbu_cnt   : 0,

        fbu_rt_start   : 0,
        fbu_rt_total   : 0,
        fbu_rt_cnt     : 0,
        pixels         : 0
    },

    test_mode        = false,

    def_con_timeout  = Websock_native ? 20 : 25,

    //scale type
    NO_SCALE = 0,
    PHONE_SCALE = 1,
    FULL_SCALE = 2,
    //end

    /* Mouse state */
    mouse_buttonMask = 0,
    mouse_arr        = [],
    viewportDragging = false,
    viewportDragPos  = {};



// Configuration attributes
Util.conf_defaults(conf, that, defaults, [
    ['target',             'wo', 'dom', null, 'VNC display rendering Canvas object'],
    ['focusContainer',     'wo', 'dom', document, 'DOM element that captures keyboard input'],

    ['encrypt',            'rw', 'bool', false, 'Use TLS/SSL/wss encryption'],
    ['true_color',         'rw', 'bool', true,  'Request true color pixel data'],
    ['local_cursor',       'rw', 'bool', false, 'Request locally rendered cursor'],
    ['shared',             'rw', 'bool', true,  'Request shared mode'],
    ['view_only',          'rw', 'bool', false, 'Disable client mouse/keyboard'],

    ['clientWidth',     'rw', 'int', 0, 'width of client'],
    ['clientHeight',     'rw', 'int', 0, 'height of client'],
    ['scaleType',     'rw', 'int', 0, 'height of client'],
    ['connectTimeout',     'rw', 'int', def_con_timeout, 'Time (s) to wait for connection'],
    ['disconnectTimeout',  'rw', 'int', 3,    'Time (s) to wait for disconnection'],

    // UltraVNC repeater ID to connect to
    ['repeaterID',         'rw', 'str',  '',    'RepeaterID to connect to'],

    ['viewportDrag',       'rw', 'bool', false, 'Move the viewport on mouse drags'],

    ['check_rate',         'rw', 'int', 217,  'Timing (ms) of send/receive check'],
    ['fbu_req_rate',       'rw', 'int', 413, 'Timing (ms) of frameBufferUpdate requests'],//MQ

    // Callback functions
    ['onUpdateState',      'rw', 'func', function() { },
        'onUpdateState(rfb, state, oldstate, statusMsg): RFB state update/change '],
    ['onPasswordRequired', 'rw', 'func', function() { },
        'onPasswordRequired(rfb): VNC password is required '],
    ['onClipboard',        'rw', 'func', function() { },
        'onClipboard(rfb, text): RFB clipboard contents received'],
    ['onBell',             'rw', 'func', function() { },
        'onBell(rfb): RFB Bell message received '],
    ['onFBUReceive',       'rw', 'func', function() { },
        'onFBUReceive(rfb, fbu): RFB FBU received but not yet processed '],
    ['onFBUComplete',      'rw', 'func', function() { },
        'onFBUComplete(rfb, fbu): RFB FBU received and processed '],
    ['onFBResize',         'rw', 'func', function() { },
        'onFBResize(rfb, width, height): frame buffer resized'],
    ['onDesktopName',      'rw', 'func', function() { },
        'onDesktopName(rfb, name): desktop name received'],

    // These callback names are deprecated
    ['updateState',        'rw', 'func', function() { },
        'obsolete, use onUpdateState'],
    ['clipboardReceive',   'rw', 'func', function() { },
        'obsolete, use onClipboard']
    ]
    );


// Override/add some specific configuration getters/setters
that.set_local_cursor = function(cursor) 
{
    if ((!cursor) || (cursor in {'0':1, 'no':1, 'false':1})) 
    {
        conf.local_cursor = false;
    } 
    else 
    {
        if (display.get_cursor_uri()) 
        {
            conf.local_cursor = true;
        } 
        else 
        {
            Util.Warn("Browser does not support local cursor");
        }
    }
};

// These are fake configuration getters
that.get_display = function() 
{ 
    return display; 
};

that.get_keyboard = function() 
{ 
    return keyboard; 
};

that.get_mouse = function() 
{ 
    return mouse; 
};



//
// Setup routines
//

// Create the public API interface and initialize values that stay
// constant across connect/disconnect
function constructor() 
{
    var i, rmode;
    //Util.Debug(">> RFB.constructor");

    // Create lookup tables based encoding number
    for (i=0; i < encodings.length; i+=1) 
    {
        encHandlers[encodings[i][1]] = encHandlers[encodings[i][0]];
        encNames[encodings[i][1]] = encodings[i][0];
        encStats[encodings[i][1]] = [0, 0];
    }
    // Initialize display, mouse, keyboard, and websock
    try 
    {
        display   = new Display({'target': conf.target});
    } 
    catch (exc) 
    {
        Util.Error("Display exception: " + exc);
        updateState('fatal', "No working Display");
    }
    keyboard = new Keyboard(
        {
            'target': conf.focusContainer,
            'onKeyPress': keyPress
        }
        );
    mouse    = new Mouse(
        {
            'target': conf.target,
            'onMouseButton': mouseButton,
            'onMouseMove': mouseMove
        }
        );

    rmode = display.get_render_mode();

    ws = new Websock();
    ws.on('message', handle_message);
    ws.on('open', function() 
    {

        if (rfb_state === "connect") 
        {
            updateState('ProtocolVersion', "Starting VNC handshake");
        } 
        else 
        {
            fail("Got unexpected WebSockets connection");
        }

    }
    );
    ws.on('close', function(e) {
        Util.Warn("WebSocket on-close event");
        var msg = "";
        if (e.code) {
            msg = " (code: " + e.code;
            if (e.reason) {
                msg += ", reason: " + e.reason;
            }
            msg += ")";
        }
        if (rfb_state === 'disconnect') {
            updateState('disconnected', 'VNC disconnected' + msg);
        } else if (rfb_state === 'ProtocolVersion') {
            fail('Failed to connect to server' + msg);
        } else if (rfb_state in {'failed':1, 'disconnected':1}) {
            Util.Error("Received onclose while disconnected" + msg);
        } else  {
            fail('Server disconnected' + msg);
        }
    });
    ws.on('error', function(e) {
        Util.Warn("WebSocket on-error event");
        //fail("WebSock reported an error");
    });


    init_vars();

    /* Check web-socket-js if no builtin WebSocket support */
    if (Websock_native) 
    {
        Util.Info("Using native WebSockets");
        updateState('loaded', 'noVNC ready: native WebSockets, ' + rmode);
    } 
    else 
    {
        Util.Warn("Using web-socket-js bridge. Flash version: " +
                  Util.Flash.version);
        if ((! Util.Flash) )//9)) MQ for test
        {
            updateState('fatal', "WebSockets or <a href='http://get.adobe.com/flashplayer'>Adobe Flash<\/a> is required--version:"
                +Util.Flash.version);
        } 
        else if (document.location.href.substr(0, 7) === "file://") 
        {
            updateState('fatal',
                    "'file://' URL is incompatible with Adobe Flash");
        } 
        else 
        {
            updateState('loaded', 'noVNC ready: WebSockets emulation, ' + rmode);
        }
    }

    //Util.Debug("<< RFB.constructor");
    return that;  // Return the public API interface
}

function connect() 
{
    //Util.Debug(">> RFB.connect");
    var uri;
    
    if (typeof UsingSocketIO !== "undefined") 
    {
        uri = "http://" + rfb_host + ":" + rfb_port + "/" + rfb_path;
    } 
    else 
    {
        if (conf.encrypt) 
        {
            uri = "wss://";
        } 
        else 
        {
            uri = "ws://";
        }
        uri += rfb_host + ":" + rfb_port + "/" + rfb_path;
    }
    Util.Info("connecting to " + uri);
    // TODO: make protocols a configurable
    ws.open(uri, ['binary', 'base64']);

    //Util.Debug("<< RFB.connect");
}

// Initialize variables that are reset before each connection
init_vars = function() 
{
    var i;

    /* Reset state */
    ws.init();

    FBU.rects        = 0;
    FBU.subrects     = 0;  // RRE and HEXTILE
    FBU.lines        = 0;  // RAW
    FBU.tiles        = 0;  // HEXTILE
    FBU.zlibs        = []; // TIGHT zlib encoders
    mouse_buttonMask = 0;
    mouse_arr        = [];

    // Clear the per connection encoding stats
    for (i=0; i < encodings.length; i+=1) 
    {
        encStats[encodings[i][1]][0] = 0;
    }

    FBU.zlib_zrle = new TINF();
    FBU.zlib_zrle.init();
    
    for (i=0; i < 4; i++) 
    {
        //FBU.zlibs[i] = new InflateStream();
        FBU.zlibs[i] = new TINF();
        FBU.zlibs[i].init();
    }
};

// Print statistics
print_stats = function() 
{
    var i, s;
    Util.Info("Encoding stats for this connection:");
    for (i=0; i < encodings.length; i+=1) 
    {
        s = encStats[encodings[i][1]];
        if ((s[0] + s[1]) > 0) 
        {
            Util.Info("    " + encodings[i][0] + ": " +
                      s[0] + " rects");
        }
    }
    Util.Info("Encoding stats since page load:");
    for (i=0; i < encodings.length; i+=1) 
    {
        s = encStats[encodings[i][1]];
        if ((s[0] + s[1]) > 0) 
        {
            Util.Info("    " + encodings[i][0] + ": " +
                      s[1] + " rects");
        }
    }
};

//
// Utility routines
//


/*
 * Page states:
 *   loaded       - page load, equivalent to disconnected
 *   disconnected - idle state
 *   connect      - starting to connect (to ProtocolVersion)
 *   normal       - connected
 *   disconnect   - starting to disconnect
 *   failed       - abnormal disconnect
 *   fatal        - failed to load page, or fatal error
 *
 * RFB protocol initialization states:
 *   ProtocolVersion 
 *   Security
 *   Authentication
 *   password     - waiting for password, not part of RFB
 *   SecurityResult
 *   ClientInitialization - not triggered by server message
 *   ServerInitialization (to normal)
 */
updateState = function(state, statusMsg) 
{
    var func, cmsg, oldstate = rfb_state;

    if (state === oldstate) 
    {
        /* Already here, ignore */
        //Util.Debug("Already in state '" + state + "', ignoring.");
        return;
    }

    /* 
     * These are disconnected states. A previous connect may
     * asynchronously cause a connection so make sure we are closed.
     */
    if (state in {'disconnected':1, 'loaded':1, 'connect':1,
                  'disconnect':1, 'failed':1, 'fatal':1}) 
    {
        if (sendTimer) 
        {
            clearInterval(sendTimer);
            sendTimer = null;
        }

        if (msgTimer) 
        {
            clearTimeout(msgTimer);
            msgTimer = null;
        }

        if (display && display.get_context()) 
        {
            keyboard.ungrab();
            mouse.ungrab();
            display.defaultCursor();

            if ((Util.get_logging() !== 'debug') ||
                (state === 'loaded')) 
            {
                // Show noVNC logo on load and when disconnected if
                // debug is off
                display.clear();
            }
        }

        ws.close();
    }

    if (oldstate === 'fatal') 
    {
        Util.Error("Fatal error, cannot continue");
    }

    if ((state === 'failed') || (state === 'fatal')) 
    {
        func = Util.Error;
    } 
    else 
    {
        func = Util.Warn;
    }

    cmsg = typeof(statusMsg) !== 'undefined' ? (" Msg: " + statusMsg) : "";
    func("New state '" + state + "', was '" + oldstate + "'." + cmsg);

    if ((oldstate === 'failed') && (state === 'disconnected')) 
    {
        // Do disconnect action, but stay in failed state.
        rfb_state = 'failed';
    } 
    else 
    {
        rfb_state = state;
    }


    if (connTimer && (rfb_state !== 'connect')) 
    {
        //Util.Debug("Clearing connect timer");
        clearTimeout(connTimer);
        connTimer = null;
    }

    if (disconnTimer && (rfb_state !== 'disconnect')) 
    {
        //Util.Debug("Clearing disconnect timer");
        clearTimeout(disconnTimer);
        disconnTimer = null;
    }

    switch (state) 
    {
    case 'normal':
        if ((oldstate === 'disconnected') || (oldstate === 'failed')) 
        {
            Util.Error("Invalid transition from 'disconnected' or 'failed' to 'normal'");
        }

        break;


    case 'connect':
        connTimer = setTimeout(function () 
        {
                fail("Connect timeout");
        }, conf.connectTimeout * 1000);

        init_vars();
        connect();

        // WebSocket.onopen transitions to 'ProtocolVersion'
        break;


    case 'disconnect':

        if (! test_mode) 
        {
            disconnTimer = setTimeout(function () 
            {
                    fail("Disconnect timeout");
            }, conf.disconnectTimeout * 1000);
        }

        print_stats();

        // WebSocket.onclose transitions to 'disconnected'
        break;


    case 'failed':
        if (oldstate === 'disconnected') 
        {
            Util.Error("Invalid transition from 'disconnected' to 'failed'");
        }
        if (oldstate === 'normal') 
        {
            Util.Error("Error while connected.");
        }
        if (oldstate === 'init') 
        {
            Util.Error("Error while initializing.");
        }

        // Make sure we transition to disconnected
        setTimeout(function() 
            { 
                updateState('disconnected'); 
            }, 50);

        break;


    default:
        // No state change action to take

    }

    if ((oldstate === 'failed') && (state === 'disconnected')) 
    {
        // Leave the failed message
        conf.updateState(that, state, oldstate); // Obsolete
        conf.onUpdateState(that, state, oldstate);
    } 
    else 
    {
        conf.updateState(that, state, oldstate, statusMsg); // Obsolete
        conf.onUpdateState(that, state, oldstate, statusMsg);
    }
};

fail = function(msg) 
{
    updateState('failed', msg);
    return false;
};

handle_message = function() 
{
    //Util.Debug(">> handle_message ws.rQlen(): " + ws.rQlen());
    //Util.Debug("ws.rQslice(0,20): " + ws.rQslice(0,20) + " (" + ws.rQlen() + ")");
    if (ws.rQlen() === 0) 
    {
        Util.Warn("handle_message called on empty receive queue");
        return;
    }
    switch (rfb_state) 
    {
    case 'disconnected':
    case 'failed':
        Util.Error("Got data while disconnected");
        break;
    case 'normal':
        if (normal_msg() && ws.rQlen() > 0) 
        {
            // true means we can continue processing
            // Give other events a chance to run
            if (msgTimer === null) 
            {
                //Util.Debug("More data to process, creating timer");
                msgTimer = setTimeout(function () 
                {
                            msgTimer = null;
                            handle_message();
                }, 10);
            } 
            else 
            {
                //Util.Debug("More data to process, existing timer");
            }
        }
        break;
    default:
        init_msg();
        break;
    }
};


function genDES(password, challenge) 
{
    var i, passwd = [];
    for (i=0; i < password.length; i += 1) 
    {
        passwd.push(password.charCodeAt(i));
    }
    return (new DES(passwd)).encrypt(challenge);
}

function flushClient() 
{
    if (mouse_arr.length > 0) 
    {
        //send(mouse_arr.concat(fbUpdateRequests()));
        ws.send(mouse_arr);
        setTimeout(function() 
        {
                ws.send(fbUpdateRequests());
        }, 50);

        mouse_arr = [];
        return true;
    } 
    else 
    {
        return false;
    }
}

// overridable for testing
checkEvents = function() 
{
    var now;
    if (rfb_state === 'normal' && !viewportDragging) 
    {
        if (! flushClient()) 
        {
            now = new Date().getTime();
            if (now > last_req_time + conf.fbu_req_rate) 
            {
                last_req_time = now;
                ws.send(fbUpdateRequests());
            }
        }
    }
    setTimeout(checkEvents, conf.check_rate);
};

keyPress = function(keysym, down) 
{
    var arr;

    if (conf.view_only) 
    { 
    return; 
    } // View only, skip keyboard events

    arr = keyEvent(keysym, down);
    arr = arr.concat(fbUpdateRequests());
    ws.send(arr);
};

mouseButton = function(x, y, down, bmask) 
{
    //Util.Debug('>> mouseButton ' + x + "," + y);
    if (down) 
    {
        mouse_buttonMask |= bmask;
    } 
    else 
    {
        mouse_buttonMask ^= bmask;
    }

    if (conf.viewportDrag) 
    {
        if (down && !viewportDragging) 
        {
            viewportDragging = true;
            viewportDragPos = {'x': x, 'y': y};

            // Skip sending mouse events
            return;
        } 
        else 
        {
            viewportDragging = false;
            ws.send(fbUpdateRequests()); // Force immediate redraw
        }
    }

    if (conf.view_only) 
    { 
    return; 
    } // View only, skip mouse events

    mouse_arr = mouse_arr.concat(
            pointerEvent(display.absX(x), display.absY(y)) );
    flushClient();
};

mouseMove = function(x, y) 
{
    //Util.Debug('>> mouseMove ' + x + "," + y);
    var deltaX, deltaY;

    if (viewportDragging) 
    {
        //deltaX = x - viewportDragPos.x; // drag viewport
        deltaX = viewportDragPos.x - x; // drag frame buffer
        //deltaY = y - viewportDragPos.y; // drag viewport
        deltaY = viewportDragPos.y - y; // drag frame buffer
        viewportDragPos = {'x': x, 'y': y};

        display.viewportChange(deltaX, deltaY);

        // Skip sending mouse events
        return;
    }

    if (conf.view_only) { return; } // View only, skip mouse events

    mouse_arr = mouse_arr.concat(
            pointerEvent(display.absX(x), display.absY(y)) );
};


//
// Server message handlers
//

// RFB/VNC initialisation message handler
init_msg = function() 
{
    //Util.Debug(">> init_msg [rfb_state '" + rfb_state + "']");

    var strlen, reason, length, sversion, cversion, repeaterID,
        i, types, num_types, challenge, response, bpp, depth,
        big_endian, red_max, green_max, blue_max, red_shift,
        green_shift, blue_shift, true_color, name_length, is_repeater;

    //Util.Debug("ws.rQ (" + ws.rQlen() + ") " + ws.rQslice(0));
    switch (rfb_state) 
    {

    case 'ProtocolVersion' :
        if (ws.rQlen() < 12) 
        {
            return fail("Incomplete protocol version");
        }
        sversion = ws.rQshiftStr(12).substr(4,7);
        Util.Info("Server ProtocolVersion: " + sversion);
        is_repeater = 0;
        switch (sversion) {
            case "000.000": is_repeater = 1; break; // UltraVNC repeater
            case "003.003": rfb_version = 3.3; break;
            case "003.006": rfb_version = 3.3; break;  // UltraVNC
            case "003.889": rfb_version = 3.3; break;  // Apple Remote Desktop
            case "003.007": rfb_version = 3.7; break;
            case "003.008": rfb_version = 3.8; break;
            case "004.000": rfb_version = 3.8; break;  // Intel AMT KVM
            case "004.001": rfb_version = 3.8; break;  // RealVNC 4.6
            default:
                return fail("Invalid server version " + sversion);
        }
        if (is_repeater) { 
            repeaterID = conf.repeaterID;
            while (repeaterID.length < 250) {
                repeaterID += "\0";
            }
            ws.send_string(repeaterID);
            break;
        }
        if (rfb_version > rfb_max_version) { 
            rfb_version = rfb_max_version;
        }

        if (! test_mode) 
        {
            sendTimer = setInterval(function() 
            {
                    // Send updates either at a rate of one update
                    // every 50ms, or whatever slower rate the network
                    // can handle.
                    ws.flush();
            }, 50);
        }

        cversion = "00" + parseInt(rfb_version,10) +
                   ".00" + ((rfb_version * 10) % 10);
        ws.send_string("RFB " + cversion + "\n");
        updateState('Security', "Sent ProtocolVersion: " + cversion);
        break;

    case 'Security' :
        if (rfb_version >= 3.7) 
        {
            // Server sends supported list, client decides 
            num_types = ws.rQshift8();
            if (ws.rQwait("security type", num_types, 1)) { return false; }
            if (num_types === 0) 
            {
                strlen = ws.rQshift32();
                reason = ws.rQshiftStr(strlen);
                return fail("Security failure: " + reason);
            }
            rfb_auth_scheme = 0;
            types = ws.rQshiftBytes(num_types);
            //Util.Debug("Server security types: " + types);
            for (i=0; i < types.length; i+=1) 
            {
                if ((types[i] > rfb_auth_scheme) && (types[i] < 3)) 
                {
                    rfb_auth_scheme = types[i];
                }
            }
            if (rfb_auth_scheme === 0) 
            {
                return fail("Unsupported security types: " + types);
            }
            
            ws.send([rfb_auth_scheme]);
        } 
        else 
        {
            // Server decides
            if (ws.rQwait("security scheme", 4)) { return false; }
            rfb_auth_scheme = ws.rQshift32();
        }
        updateState('Authentication',
                "Authenticating using scheme: " + rfb_auth_scheme);
        init_msg();  // Recursive fallthrough (workaround JSLint complaint)
        break;

    // Triggered by fallthough, not by server message
    case 'Authentication' :
        //Util.Debug("Security auth scheme: " + rfb_auth_scheme);
        switch (rfb_auth_scheme) 
        {
            case 0:  // connection failed
                if (ws.rQwait("auth reason", 4)) { return false; }
                strlen = ws.rQshift32();
                reason = ws.rQshiftStr(strlen);
                return fail("Auth failure: " + reason);
            case 1:  // no authentication
                if (rfb_version >= 3.8) 
                {
                    updateState('SecurityResult');
                    return;
                }
                // Fall through to ClientInitialisation
                break;
            case 2:  // VNC authentication
                if (rfb_password.length === 0) 
                {
                    // Notify via both callbacks since it is kind of
                    // a RFB state change and a UI interface issue.
                    updateState('password', "Password Required");
                    conf.onPasswordRequired(that);
                    return;
                }
                if (ws.rQwait("auth challenge", 16)) { return false; }
                challenge = ws.rQshiftBytes(16);
                //Util.Debug("Password: " + rfb_password);
                //Util.Debug("Challenge: " + challenge +
                //           " (" + challenge.length + ")");
                response = genDES(rfb_password, challenge);
                //Util.Debug("Response: " + response +
                //           " (" + response.length + ")");
                
                //Util.Debug("Sending DES encrypted auth response");
                ws.send(response);
                updateState('SecurityResult');
                return;
            default:
                fail("Unsupported auth scheme: " + rfb_auth_scheme);
                return;
        }
        updateState('ClientInitialisation', "No auth required");
        init_msg();  // Recursive fallthrough (workaround JSLint complaint)
        break;

    case 'SecurityResult' :
        if (ws.rQwait("VNC auth response ", 4)) { return false; }
        switch (ws.rQshift32()) {
            case 0:  // OK
                // Fall through to ClientInitialisation
                break;
            case 1:  // failed
                if (rfb_version >= 3.8) {
                    length = ws.rQshift32();
                    if (ws.rQwait("SecurityResult reason", length, 8)) {
                        return false;
                    }
                    reason = ws.rQshiftStr(length);
                    fail(reason);
                } else {
                    fail("Authentication failed");
                }
                return;
            case 2:  // too-many
                return fail("Too many auth attempts");
        }
        updateState('ClientInitialisation', "Authentication OK");
        init_msg();  // Recursive fallthrough (workaround JSLint complaint)
        break;

    // Triggered by fallthough, not by server message
    case 'ClientInitialisation' :
        ws.send([conf.shared ? 1 : 0]); // ClientInitialisation
        Util.Debug("shared:"+conf.shared+"===sendData:"+([conf.shared ? 1 : 0]));
        updateState('ServerInitialisation', "Authentication OK");
        break;

    case 'ServerInitialisation' :
        if (ws.rQwait("server initialization", 24)) { return false; }

        /* Screen size */
        fb_width  = ws.rQshift16();
        fb_height = ws.rQshift16();

        /* PIXEL_FORMAT */
        bpp            = ws.rQshift8();
        depth          = ws.rQshift8();
        big_endian     = ws.rQshift8();
        true_color     = ws.rQshift8();

        red_max        = ws.rQshift16();
        green_max      = ws.rQshift16();
        blue_max       = ws.rQshift16();
        red_shift      = ws.rQshift8();
        green_shift    = ws.rQshift8();
        blue_shift     = ws.rQshift8();
        ws.rQshiftStr(3); // padding

        Util.Info("Screen: " + fb_width + "x" + fb_height + 
                  ", bpp: " + bpp + ", depth: " + depth +
                  ", big_endian: " + big_endian +
                  ", true_color: " + true_color +
                  ", red_max: " + red_max +
                  ", green_max: " + green_max +
                  ", blue_max: " + blue_max +
                  ", red_shift: " + red_shift +
                  ", green_shift: " + green_shift +
                  ", blue_shift: " + blue_shift);

        if (big_endian !== 0) {
            Util.Warn("Server native endian is not little endian");
        }
        if (red_shift !== 16) {
            Util.Warn("Server native red-shift is not 16");
        }
        if (blue_shift !== 0) {
            Util.Warn("Server native blue-shift is not 0");
        }

        /* Connection name/title */
        name_length   = ws.rQshift32();
        fb_name = ws.rQshiftStr(name_length);
        conf.onDesktopName(that, fb_name);
        
        if (conf.true_color && fb_name === "Intel(r) AMT KVM")
        {
            Util.Warn("Intel AMT KVM only support 8/16 bit depths. Disabling true color");
            conf.true_color = false;
        }
        getInfo();

        display.set_true_color(conf.true_color);
        conf.onFBResize(that, fb_width, fb_height);
        display.resize(fb_width, fb_height);
        scaleCanvas();
        
        //keyboard.grab();
        //mouse.grab();

        if (conf.true_color) {
            fb_Bpp           = 4;
            fb_depth         = 3;
        } else {
            fb_Bpp           = 1;
            fb_depth         = 1;
        }

        response = clientEncodings();
        response = response.concat(pixelFormat());
        response = response.concat(fbUpdateRequests());
        timing.fbu_rt_start = (new Date()).getTime();
        timing.pixels = 0;
        ws.send(response);
        
        /* Start pushing/polling */
        setTimeout(checkEvents, conf.check_rate);

        if (conf.encrypt) {
            updateState('normal', "Connected (encrypted) to: " + fb_name);
        } else {
            updateState('normal', "Connected (unencrypted) to: " + fb_name);
        }
        break;
    }
    //Util.Debug("<< init_msg");
};

function scaleCanvas() {
    Util.Debug("scaleCanvas--scaleType:"+conf.scaleType);
   var ratio, scaleX, scaleY;
   switch (conf.scaleType) {
        case NO_SCALE:
            return;
        case PHONE_SCALE:
            if (conf.clientWidth < fb_width) {
                scaleX = (conf.clientWidth / fb_width);
                scaleY = scaleX;
            } else {
                return;
            }
            break;
        case FULL_SCALE:
           scaleX = (conf.clientWidth / fb_width);
            scaleY = (conf.clientHeight / fb_height);
            break;

   }

    Util.Debug("["+conf.clientWidth+","+conf.clientHeight+"]");
    Util.Debug("try to scale---:"+scaleX + "," + scaleY);
    display.set_scale(scaleX, scaleY);
}

function getInfo() 
{ 
var s = ""; 
s = (" 网页可见区域宽：" + document.body.clientWidth) +
        (" 网页可见区域高：" + document.body.clientHeight) +
        (" 网页可见区域宽：" + document.body.offsetWidth +" (包括边线和滚动条的宽)") +
        (" 网页可见区域高：" + document.body.offsetHeight +" (包括边线的宽)") +
        (" 网页正文全文宽：" + document.body.scrollWidth) +
        (" 网页正文全文高：" + document.body.scrollHeight) +
        (" 网页被卷去的高(ff)：" + document.body.scrollTop) +
        (" 网页被卷去的高(ie)：" + document.documentElement.scrollTop) +
        (" 网页被卷去的左：" + document.body.scrollLeft) +
        (" 网页正文部分上：" +window.screenTop) +
        (" 网页正文部分左：" + window.screenLeft) +
        (" 屏幕分辨率的高：" + window.screen.height) +
        (" 屏幕分辨率的宽：" + window.screen.width) +
        (" 屏幕可用工作区高度：" + window.screen.availHeight) +
        (" 屏幕可用工作区宽度：" + window.screen.availWidth) +

        (" 你的屏幕设置是 " + window.screen.colorDepth +" 位彩色") +
        (" 你的屏幕设置 " + window.screen.deviceXDPI +" 像素/英寸"); 
Util.Debug(s);

} 



/* Normal RFB/VNC server message handler */
normal_msg = function() {
    //Util.Debug(">> normal_msg");

    var ret = true, msg_type, length, text,
        c, first_colour, num_colours, red, green, blue;

    if (FBU.rects > 0) {
        msg_type = 0;
    } else {
        msg_type = ws.rQshift8();
    }
    switch (msg_type) {
    case 0:  // FramebufferUpdate
        ret = framebufferUpdate(); // false means need more data
        break;
    case 1:  // SetColourMapEntries
        //Util.Debug("SetColourMapEntries");
        ws.rQshift8();  // Padding
        first_colour = ws.rQshift16(); // First colour
        num_colours = ws.rQshift16();
        if (ws.rQwait("SetColourMapEntries", num_colours*6, 6)) { return false; }
        
        for (c=0; c < num_colours; c+=1) { 
            red = ws.rQshift16();
            //Util.Debug("red before: " + red);
            red = parseInt(red / 256, 10);
            //Util.Debug("red after: " + red);
            green = parseInt(ws.rQshift16() / 256, 10);
            blue = parseInt(ws.rQshift16() / 256, 10);
            display.set_colourMap([blue, green, red], first_colour + c);
        }
        //Util.Debug("colourMap: " + display.get_colourMap());
        Util.Info("Registered " + num_colours + " colourMap entries");
        //Util.Debug("colourMap: " + display.get_colourMap());
        break;
    case 2:  // Bell
        //Util.Debug("Bell");
        conf.onBell(that);
        break;
    case 3:  // ServerCutText
        //Util.Debug("ServerCutText");
        if (ws.rQwait("ServerCutText header", 7, 1)) { return false; }
        ws.rQshiftBytes(3);  // Padding
        length = ws.rQshift32();
        if (ws.rQwait("ServerCutText", length, 8)) { return false; }

        text = ws.rQshiftStr(length);
        conf.clipboardReceive(that, text); // Obsolete
        conf.onClipboard(that, text);
        break;
    default:
        fail("Disconnected: illegal server message type " + msg_type);
        //Util.Debug("ws.rQslice(0,30):" + ws.rQslice(0,30));
        break;
    }
    //Util.Debug("<< normal_msg");
    return ret;
};

framebufferUpdate = function() {
    var now, hdr, fbu_rt_diff, ret = true;

    if (FBU.rects === 0) {
        //Util.Debug("New FBU: ws.rQslice(0,20): " + ws.rQslice(0,20));
        if (ws.rQwait("FBU header", 3)) {
            ws.rQunshift8(0);  // FBU msg_type
            return false;
        }
        ws.rQshift8();  // padding
        FBU.rects = ws.rQshift16();
        //Util.Debug("FramebufferUpdate, rects:" + FBU.rects);
        FBU.bytes = 0;
        timing.cur_fbu = 0;
        if (timing.fbu_rt_start > 0) {
            now = (new Date()).getTime();
            Util.Info("First FBU latency: " + (now - timing.fbu_rt_start));
        }
    }

    while (FBU.rects > 0) {
        if (rfb_state !== "normal") {
            return false;
        }
        if (ws.rQwait("FBU", FBU.bytes)) { return false; }
        if (FBU.bytes === 0) {
            if (ws.rQwait("rect header", 12)) { return false; }
            /* New FramebufferUpdate */

            hdr = ws.rQshiftBytes(12);
            FBU.x      = (hdr[0] << 8) + hdr[1];
            FBU.y      = (hdr[2] << 8) + hdr[3];
            FBU.width  = (hdr[4] << 8) + hdr[5];
            FBU.height = (hdr[6] << 8) + hdr[7];
            FBU.encoding = parseInt((hdr[8] << 24) + (hdr[9] << 16) +
                                    (hdr[10] << 8) +  hdr[11], 10);

            conf.onFBUReceive(that,
                    {'x': FBU.x, 'y': FBU.y,
                     'width': FBU.width, 'height': FBU.height,
                     'encoding': FBU.encoding,
                     'encodingName': encNames[FBU.encoding]});

            if (encNames[FBU.encoding]) {
                // Debug:
                
                var msg =  "FramebufferUpdate rects:" + FBU.rects;
                msg += " x: " + FBU.x + " y: " + FBU.y;
                msg += " width: " + FBU.width + " height: " + FBU.height;
                msg += " encoding:" + FBU.encoding;
                msg += "(" + encNames[FBU.encoding] + ")";
                msg += ", ws.rQlen(): " + ws.rQlen();
                //Util.Debug(msg);
                
            } else {
                fail("Disconnected: unsupported encoding " +
                    FBU.encoding);
                return false;
            }
        }

        timing.last_fbu = (new Date()).getTime();
        //Util.Debug("--"+FBU.encoding+"----"+ws.rQslice(0, 20))
        ret = encHandlers[FBU.encoding]();

        now = (new Date()).getTime();
        timing.cur_fbu += (now - timing.last_fbu);

        if (ret) {
            encStats[FBU.encoding][0] += 1;
            encStats[FBU.encoding][1] += 1;
            timing.pixels += FBU.width * FBU.height;
        }

        if (timing.pixels >= (fb_width * fb_height)) {
            if (((FBU.width === fb_width) &&
                        (FBU.height === fb_height)) ||
                    (timing.fbu_rt_start > 0)) {
                timing.full_fbu_total += timing.cur_fbu;
                timing.full_fbu_cnt += 1;
                Util.Info("Timing of full FBU, cur: " +
                          timing.cur_fbu + ", total: " +
                          timing.full_fbu_total + ", cnt: " +
                          timing.full_fbu_cnt + ", avg: " +
                          (timing.full_fbu_total /
                              timing.full_fbu_cnt));
            }
            if (timing.fbu_rt_start > 0) {
                fbu_rt_diff = now - timing.fbu_rt_start;
                timing.fbu_rt_total += fbu_rt_diff;
                timing.fbu_rt_cnt += 1;
                Util.Info("full FBU round-trip, cur: " +
                          fbu_rt_diff + ", total: " +
                          timing.fbu_rt_total + ", cnt: " +
                          timing.fbu_rt_cnt + ", avg: " +
                          (timing.fbu_rt_total /
                              timing.fbu_rt_cnt));
                timing.fbu_rt_start = 0;
            }
        }
        if (! ret) {
            return ret; // false ret means need more data
        }
    }

    conf.onFBUComplete(that,
            {'x': FBU.x, 'y': FBU.y,
                'width': FBU.width, 'height': FBU.height,
                'encoding': FBU.encoding,
                'encodingName': encNames[FBU.encoding]});

    return true; // We finished this FBU
};

//
// FramebufferUpdate encodings
//

encHandlers.RAW = function display_raw() {
    //Util.Debug(">> display_raw (" + ws.rQlen() + " bytes)");

    var cur_y, cur_height;

    if (FBU.lines === 0) {
        FBU.lines = FBU.height;
    }
    FBU.bytes = FBU.width * fb_Bpp; // At least a line
    if (ws.rQwait("RAW", FBU.bytes)) { return false; }
    cur_y = FBU.y + (FBU.height - FBU.lines);
    cur_height = Math.min(FBU.lines,
                          Math.floor(ws.rQlen()/(FBU.width * fb_Bpp)));
    display.blitImage(FBU.x, cur_y, FBU.width, cur_height,
            ws.get_rQ(), ws.get_rQi());
    ws.rQshiftBytes(FBU.width * cur_height * fb_Bpp);
    FBU.lines -= cur_height;

    if (FBU.lines > 0) {
        FBU.bytes = FBU.width * fb_Bpp; // At least another line
    } else {
        FBU.rects -= 1;
        FBU.bytes = 0;
    }
    //Util.Debug("<< display_raw (" + ws.rQlen() + " bytes)");
    return true;
};

encHandlers.COPYRECT = function display_copy_rect() {
    //Util.Debug(">> display_copy_rect");

    var old_x, old_y;

    FBU.bytes = 4;
    if (ws.rQwait("COPYRECT", 4)) { return false; }
    display.renderQ_push({
            'type': 'copy',
            'old_x': ws.rQshift16(),
            'old_y': ws.rQshift16(),
            'x': FBU.x,
            'y': FBU.y,
            'width': FBU.width,
            'height': FBU.height});
    FBU.rects -= 1;
    FBU.bytes = 0;
    return true;
};

encHandlers.RRE = function display_rre() {
    //Util.Debug(">> display_rre (" + ws.rQlen() + " bytes)");
    var color, x, y, width, height, chunk;

    if (FBU.subrects === 0) {
        FBU.bytes = 4+fb_Bpp;
        if (ws.rQwait("RRE", 4+fb_Bpp)) { return false; }
        FBU.subrects = ws.rQshift32();
        color = ws.rQshiftBytes(fb_Bpp); // Background
        display.fillRect(FBU.x, FBU.y, FBU.width, FBU.height, color);
    }
    while ((FBU.subrects > 0) && (ws.rQlen() >= (fb_Bpp + 8))) {
        color = ws.rQshiftBytes(fb_Bpp);
        x = ws.rQshift16();
        y = ws.rQshift16();
        width = ws.rQshift16();
        height = ws.rQshift16();
        display.fillRect(FBU.x + x, FBU.y + y, width, height, color);
        FBU.subrects -= 1;
    }
    //Util.Debug("   display_rre: rects: " + FBU.rects +
    //           ", FBU.subrects: " + FBU.subrects);

    if (FBU.subrects > 0) {
        chunk = Math.min(rre_chunk_sz, FBU.subrects);
        FBU.bytes = (fb_Bpp + 8) * chunk;
    } else {
        FBU.rects -= 1;
        FBU.bytes = 0;
    }
    //Util.Debug("<< display_rre, FBU.bytes: " + FBU.bytes);
    return true;
};

encHandlers.HEXTILE = function display_hextile() {
    //Util.Debug(">> display_hextile");
    var subencoding, subrects, color, cur_tile,
        tile_x, x, w, tile_y, y, h, xy, s, sx, sy, wh, sw, sh,
        rQ = ws.get_rQ(), rQi = ws.get_rQi(); 

    if (FBU.tiles === 0) {
        FBU.tiles_x = Math.ceil(FBU.width/16);
        FBU.tiles_y = Math.ceil(FBU.height/16);
        FBU.total_tiles = FBU.tiles_x * FBU.tiles_y;
        FBU.tiles = FBU.total_tiles;
    }

    /* FBU.bytes comes in as 1, ws.rQlen() at least 1 */
    while (FBU.tiles > 0) {
        FBU.bytes = 1;
        if (ws.rQwait("HEXTILE subencoding", FBU.bytes)) { return false; }
        subencoding = rQ[rQi];  // Peek
        if (subencoding > 30) { // Raw
            fail("Disconnected: illegal hextile subencoding " + subencoding);
            //Util.Debug("ws.rQslice(0,30):" + ws.rQslice(0,30));
            return false;
        }
        subrects = 0;
        cur_tile = FBU.total_tiles - FBU.tiles;
        tile_x = cur_tile % FBU.tiles_x;
        tile_y = Math.floor(cur_tile / FBU.tiles_x);
        x = FBU.x + tile_x * 16;
        y = FBU.y + tile_y * 16;
        w = Math.min(16, (FBU.x + FBU.width) - x);
        h = Math.min(16, (FBU.y + FBU.height) - y);

        /* Figure out how much we are expecting */
        if (subencoding & 0x01) { // Raw
            //Util.Debug("   Raw subencoding");
            FBU.bytes += w * h * fb_Bpp;
        } else {
            if (subencoding & 0x02) { // Background
                FBU.bytes += fb_Bpp;
            }
            if (subencoding & 0x04) { // Foreground
                FBU.bytes += fb_Bpp;
            }
            if (subencoding & 0x08) { // AnySubrects
                FBU.bytes += 1;   // Since we aren't shifting it off
                if (ws.rQwait("hextile subrects header", FBU.bytes)) { return false; }
                subrects = rQ[rQi + FBU.bytes-1]; // Peek
                if (subencoding & 0x10) { // SubrectsColoured
                    FBU.bytes += subrects * (fb_Bpp + 2);
                } else {
                    FBU.bytes += subrects * 2;
                }
            }
        }

        /*
        Util.Debug("   tile:" + cur_tile + "/" + (FBU.total_tiles - 1) +
              " (" + tile_x + "," + tile_y + ")" +
              " [" + x + "," + y + "]@" + w + "x" + h +
              ", subenc:" + subencoding +
              "(last: " + FBU.lastsubencoding + "), subrects:" +
              subrects +
              ", ws.rQlen():" + ws.rQlen() + ", FBU.bytes:" + FBU.bytes +
              " last:" + ws.rQslice(FBU.bytes-10, FBU.bytes) +
              " next:" + ws.rQslice(FBU.bytes-1, FBU.bytes+10));
        */
        if (ws.rQwait("hextile", FBU.bytes)) { return false; }

        /* We know the encoding and have a whole tile */
        FBU.subencoding = rQ[rQi];
        rQi += 1;
        if (FBU.subencoding === 0) {
            if (FBU.lastsubencoding & 0x01) {
                /* Weird: ignore blanks after RAW */
                Util.Debug("     Ignoring blank after RAW");
            } else {
                display.fillRect(x, y, w, h, FBU.background);
            }
        } else if (FBU.subencoding & 0x01) { // Raw
            display.blitImage(x, y, w, h, rQ, rQi);
            rQi += FBU.bytes - 1;
        } else {
            if (FBU.subencoding & 0x02) { // Background
                FBU.background = rQ.slice(rQi, rQi + fb_Bpp);
                rQi += fb_Bpp;
            }
            if (FBU.subencoding & 0x04) { // Foreground
                FBU.foreground = rQ.slice(rQi, rQi + fb_Bpp);
                rQi += fb_Bpp;
            }

            display.startTile(x, y, w, h, FBU.background);
            if (FBU.subencoding & 0x08) { // AnySubrects
                subrects = rQ[rQi];
                rQi += 1;
                for (s = 0; s < subrects; s += 1) {
                    if (FBU.subencoding & 0x10) { // SubrectsColoured
                        color = rQ.slice(rQi, rQi + fb_Bpp);
                        rQi += fb_Bpp;
                    } else {
                        color = FBU.foreground;
                    }
                    xy = rQ[rQi];
                    rQi += 1;
                    sx = (xy >> 4);
                    sy = (xy & 0x0f);

                    wh = rQ[rQi];
                    rQi += 1;
                    sw = (wh >> 4)   + 1;
                    sh = (wh & 0x0f) + 1;

                    display.subTile(sx, sy, sw, sh, color);
                }
            }
            display.finishTile();
        }
        ws.set_rQi(rQi);
        FBU.lastsubencoding = FBU.subencoding;
        FBU.bytes = 0;
        FBU.tiles -= 1;
    }

    if (FBU.tiles === 0) {
        FBU.rects -= 1;
    }

    //Util.Debug("<< display_hextile");
    return true;
};

function transformPixel(pixel) {
    //Util.Debug("<<<transformPixel:--"+pixel);
    var result = 0;
    for (var i = 0; i < colorDepth; i++) {
        var item = pixel >> (colorDepth - i - 1) & 1;
        if (item == 1) {
            item = (item << zrlePixFactor) -1;
        };
        result += item << (colorDepth - i - 1) * zrlePixFactor;
    };
    //Util.Debug(">>>transformPixel:--"+result);
    return result;
}

function readBufferData(count, zrleInStream) {
    //Util.Debug("<<<<<<<<readBufferData--count:"+count+zrleInStream.debugBuf());
    var result = [];
    if (colorDepth == 24) {

            var data = zrleInStream.readData(count*3); //ws.rQshiftBytes(count*3);
            //ptr += count*3;

            for (var i = 0; i < count; i++) {
                result[i] = (data[i*3+2] & 0xFF) << 16 |
                                    (data[i*3+1] & 0xFF) << 8 |
                                    (data[i*3] & 0xFF);
            };
    } else {

            var data = zrleInStream.readData(count); //ws.rQshiftBytes(count);

            for (var i = 0; i < count; i++) {
               result[i] = transformPixel(data[i]);
            };
    }
    return result;
}

function HandleData(tx, ty, tw, th, rle, palSize, palette, zrleInStream) {
    var useOld = false;
//Util.Debug("<<HandleData----["+tx+","+ty+","+tw+","+th+"]"+"-rle:"+rle+"-palSize:"+palSize);
    
            if (!rle) {
                if (palSize == 0) {
                    if (test_raw) {
                        Util.Debug("readZrleRawPixels-"+zrleInStream.toString());
                    };
                    
                    if (useOld) {
                        zrleTilePixels = readBufferData(tw*th, zrleInStream);
                    } else {
                        var d = [];
                        if (colorDepth == 24) {
                            d = zrleInStream.readData(tw*th*3);
                            var b;
                            for (var i = 0; i < d.length; i++) {
                                    b = d[i];
                                    b = (b & 0xF0) >> 4 | (b & 0x0F) << 4;
                                    b = (b & 0xCC) >> 2 | (b & 0x33) << 2;
                                    b = (b & 0xAA) >> 1 | (b & 0x55) << 1;
                                    zrleTilePixels[i] = b;
                            };
                        } else {
                            d = readBufferData(tw*th, zrleInStream);
                        
                            for (var i = 0; i < d.length; i++) {
                                for (var j = 0; j < 3; j++) {
                                    zrleInStream[i*3+j] = (d[i] >> (2 - j)*8) & 255;
                                };
                            };
                        }
                        
                    }
                } else {
                    if (test_packed) {
                        Util.Debug("readZrlePackedPixels-"+zrleInStream.toString());
                    };

                    var bppp = ((palSize > 16) ? 8 :
                                        ((palSize > 4) ? 4 :
                                        ((palSize > 2) ? 2 : 1)));
                    var ptr = 0;

                    for (var i = 0; i < th; i++) {
                        var eol = +ptr + (+tw);
                        var b = 0;
                        var nbits = 0;

                        while (ptr < eol) {
                            if (nbits == 0) {
                                
                                b = zrleInStream.readData(1); //ws.rQshift8();

                                nbits = 8;
                            };
                            nbits -= (+bppp);
                            var index = (b >> nbits) & ((1 << bppp) - 1) & 127;
                            if (test_packed) {
                                Util.Debug("index:"+index+"-palette:"+palette[index]);
                            };
                            if (useOld) {
                                zrleTilePixels[ptr++] = palette[index];
                            } else {
                                var j = ptr++;
                                for (var i = 0; i < 3; i++) {
                                    zrleTilePixels[j*3 + i] = ( palette[index] >> (2 - i) * 8 ) & 255;
                                };
                            }
                        }
                    };
                    if (test_packed) {
                        test_packed = false;
                    };
                    
                }
            } else {
                if (palSize == 0) {
                    if (test_plain_rle) {
                        Util.Debug("readZrlePlainRLEPixels--"+zrleInStream.toString());
                    };
                    
                    var ptr = 0;
                    var end = +ptr + (+(tw * th));
                    while (ptr < end) {
                        var pix = readBufferData(1, zrleInStream);
                        var len = 1;
                        var b;
                        do {
                            
                            b = zrleInStream.readData(1); //ws.rQshift8();
                            //Util.Debug("----b:"+b);
                            len = +len + (+b);
                            //Util.Debug("----len:"+len);
                        } while (b == 255);

                        if (!(len <= +end - ptr)) {
                            fail("ZRLE decoder: assertion failed1 (len <= end-ptr)");
                        };
                        //Util.Debug("readZrlePlainRLEPixels--len:"+len+"-ptr:"+(ptr+1)+"-pix:"+pix);
                        while (len-- > 0) { 
                            if (useOld) {
                                zrleTilePixels[ptr++] = pix;
                            } else {
                                var j = ptr++;
                                for (var i = 0; i < 3; i++) {
                                    zrleTilePixels[j*3 + i] = ( pix >> (2 - i) * 8 ) & 255;
                                };
                            }
                        }

                    }
                } else {

                    
                    if (test_packed_rle) {
                        Util.Debug("readZrlePackedRLEPixels--"+zrleInStream.toString());
                        Util.Debug("palette:"+palette);
                    };

                    var ptr = 0;
                    var end = ptr + tw * th;

                    while (ptr < end) {

                        var index = zrleInStream.readData(1); //ws.rQshift8();
                        if (test_packed_rle) {
                            Util.Debug("first index:"+index);
                        };

                        var len = 1;
                        if ((index & 128) != 0) {
                            var b;
                            do {
                                b = zrleInStream.readData(1); //ws.rQshift8();
                                len += (+b);
                            } while (b == 255);
                            if (!(len <= end - ptr)) {
                                fail("ZRLE decoder: assertion failed2 (len <= end - ptr)");
                            };
                        };
                        index &= 127;
                        if (test_packed_rle) {
                            Util.Debug("index:"+index+"-palette:"+palette[index]+"-len:"+len+"");
                            
                        };
                        var pix = palette[index];
                        while (len-- > 0) {
                            if (useOld) {
                                zrleTilePixels[ptr++] = pix;
                            } else {
                                var j = ptr++;
                                for (var i = 0; i < 3; i++) {
                                    zrleTilePixels[j*3 + i] = ( pix >> (2 - i) * 8 ) & 255;
                                };
                            }
                        }
                        if (test_packed_rle) {
                            test_packed_rle = false;
                            Util.Debug("=====================================");
                        };
                        
                    }
                    //======================================================

                }
            }

        }//handle data

function ZrleInStream (data, tiles_x, tiles_y, tiles, total_tiles, ptr) {
     this.buffer = data;
      this.ptr = ptr; 
      this.tiles_x = tiles_x; 
      this.tiles_y = tiles_y; 
      this.tiles = tiles; 
      this.total_tiles = total_tiles; 
      this.cur_tile = 0;

     this.readData = readData;
     function readData(num) {
        //Util.Debug("<<<<readData--ptr"+this.ptr);

        if ((this.ptr+num) > this.buffer.length )  {
            fail("ZRLE in Stream readData fail: (ptr+num) > buffer.length--length:"+this.buffer.length + "--ptr:"+ this.ptr +"--num:"+num);
        };

        this.ptr += num
        var data = this.buffer.slice(this.ptr-num, this.ptr);
        //this.reset();
        //Util.Debug("----"+data);
        //Util.Debug(">>>>--ptr:"+this.ptr);
        return data;
        // body...
    }

    this.reset = reset;
    function reset() {
        //Util.Debug("<<<<<<<<reset--["+this.ptr+","+this.buffer.length+"]");
        this.buffer = this.buffer.slice(this.ptr, this.buffer.length);
        this.ptr = 0;
        //Util.Debug(">>>>>>>>reset--["+this.ptr+","+this.buffer.length+"]");
    }

    this.addData = addData;
    function addData(data) {
        for (var i = 0; i < data.length; i++) {
            this.buffer.push(data[i]);
        };
    }

    function setTiles(tiles) {
        this.tiles = tiles;
    }

    function setTotalTiles(total_tiles) {
        this.total_tiles = total_tiles;
    }

    function setPtr(ptr) {
        this.ptr = ptr;
        // body...
    }

    this.debugBuf = debugBuf;
    function debugBuf() {
        //return ("ptr:"+this.ptr+"["+this.buffer.slice(this.ptr, this.ptr + 20)+"]");
        return ("toString---ptr:" + this.ptr + "--length:"+this.buffer.length + " data:" + this.buffer.slice(this.ptr, this.ptr + 20) + "\n"
            + "cur_tile:"+this.cur_tile + "-tiles_x:"+this.tiles_x + "-tiles_y:"+this.tiles_y + "-tiles:"+this.tiles+"-total_tiles:"+this.total_tiles);
    }

    this.toString = toString;
    function toString () {
        //return ("toString---ptr:" + this.ptr + "--length:"+this.buffer.length + " data:" + this.buffer.slice(this.ptr, this.ptr + 20) + "\n"
        //    + "cur_tile:"+this.cur_tile + "-tiles_x:"+this.tiles_x + "-tiles_y:"+this.tiles_y + "-tiles:"+this.tiles+"-total_tiles:"+this.total_tiles);
        return "";
        // body...
    }

}

function seeData(data) {

    Util.Debug("---------------------------------------------");
    if (data.length > 40) {
    Util.Debug("["+data.slice(0, 20)+"]");
    Util.Debug("["+data.slice(data.length-20, data.length)+"]");
    } else {
        Util.Debug("["+data.slice(0, data.length)+"]");
    }
    Util.Debug("---------------------------------------------");
}

function tranToRGB(data) {
    var dst = [];
    for (var i = 0; i < data.length; i++) {
        for (var j = 0; j < 3; i++) {
            dst[i*3 - j] = ( data[i]>> (2 - i) * 8 ) & 255;
        };
    };
    return dst;
}

encHandlers.ZRLE = function () 
{
    //Util.Debug("<<<<<<<<<<<<<<<<<<<<encHandlers.ZRLE--["+ws.rQslice(0, 10)+"]");
    var nBytes, tx, ty, tw, th, img;
    var rQ = ws.get_rQ(), rQi = ws.get_rQi();
    
    FBU.bytes = 4;
    if (ws.rQwait("ZRLE data length bytes", FBU.bytes)) { return false; }//read data length
    nBytes = ws.rQshift32();

    //================================
    //================================
    
    FBU.bytes = nBytes;
    if (ws.rQwait("ZRLE real data", FBU.bytes)) { 
        var d1 = nBytes & 255;
        var d2 = (nBytes >> 8) & 255;
        var d3 = (nBytes >> 16) & 255;
        var d4 = (nBytes >> 24) & 255;
        //Util.Debug("----wait...["+d4+","+d3+","+d2+","+d1+"]");
        ws.rQunshift8(d1);// for nBytes
        ws.rQunshift8(d2);
        ws.rQunshift8(d3);
        ws.rQunshift8(d4);
        return false; 
    }

    Util.Debug("MQ-------------nBytes:"+nBytes);

    var data = ws.rQshiftBytes(nBytes);
    //seeData(data);
    //FBU.zlib_zrle.reset();
    var uncompress = FBU.zlib_zrle.uncompress(data, 0);
    if (uncompress.status !== 0) {
            fail("uncompress failed!");
    }
    //seeData(uncompress.data);

     var tiles_x = Math.ceil(FBU.width/64);
     var tiles_y = Math.ceil(FBU.height/64);
     var total_tiles = tiles_x * tiles_y;
     var tiles = total_tiles;

     if (FBU.zrleInStream === null) {
         //Util.Debug("zrleInStream is null , so init one!-----");
         FBU.zrleInStream = new ZrleInStream(uncompress.data, tiles_x, tiles_y, tiles, total_tiles, 0);
     } else {
         FBU.zrleInStream.addData(uncompress.data);
     };
     var length = uncompress.data.length;
        
     //Util.Debug("---"+FBU.zrleInStream.debugBuf());

    for (ty = FBU.y; ty < FBU.y+FBU.height; ty += 64) {
       th = Math.min(FBU.y+FBU.height-ty, 64);
      for (tx = FBU.x; tx < FBU.x+FBU.width; tx += 64) {
        tw = Math.min(FBU.x+FBU.width-tx, 64);

//    while (FBU.zrleInStream.tiles > 0) {

        FBU.zrleInStream.cur_tile = FBU.zrleInStream.total_tiles - FBU.zrleInStream.tiles;
        //Util.Debug("=====================================")

        var tile_x = (+FBU.zrleInStream.cur_tile) % (+FBU.zrleInStream.tiles_x);
        var tile_y = Math.floor((+FBU.zrleInStream.cur_tile) / (+FBU.zrleInStream.tiles_x));
        //Util.Debug("MQ-----["+tile_x+","+tile_y+
        //    "]-cur_tile:"+FBU.zrleInStream.cur_tile);
   //     tx = FBU.x + tile_x *64;
  //      ty = FBU.y + tile_y *64;
 //       tw = Math.min(64, (FBU.x + FBU.width) - tx);
//        th = Math.min(64, (FBU.y + FBU.height) - ty);

            var mode = FBU.zrleInStream.readData(1); //ws.rQshift8();//read mode
            var rle = (mode & 128) != 0;
            var palSize = mode & 127;
            var palette = [];

            
            palette = readBufferData(palSize, FBU.zrleInStream);
            //Util.Debug("--palette:"+palette);

            if (palSize == 1) {
                var color = [];
                for (var i = 0; i < 3; i++) {
                    color[i] = (palette[0] >> (2 - i)*8) & 255;
                };
                
                display.fillRect(tx, ty, tw, th, color);
                FBU.zrleInStream.tiles -=1;
                continue;
            };

        HandleData(tx, ty, tw, th, rle, palSize, palette, FBU.zrleInStream);


        //Util.Debug("["+tx+","+ty+","+tw+","+th+"]");
        //seeData(zrleTilePixels);
        //Util.Debug("--------------------------------------------");
        //Util.Debug(""+zrleTilePixels.slice(0, 20));
        //Util.Debug("--------------------------------------------");
        //var result = tranToRGB(zrleTilePixels);
        if (true) {
            display.renderQ_push({
                'type': 'blitRgb',
                'data': zrleTilePixels,
                'x': tx,
                'y': ty,
                'width': tw,
                'height': th});
        } else {
            img = new Image();
            img.src = "data:image/" +
            extract_data_uri(zrleTilePixels);
            display.renderQ_push({
                'type': 'img',
                'img': img,
                'x': FBU.x,
                'y': FBU.y});
            img = null;
        }

        zrleTilePixels = [];
        FBU.zrleInStream.tiles -=1;
        //Util.Debug("=====================================")
    //}
        }
    }

    //if (FBU.zrleInStream.tiles == 0) {
       //Util.Debug("---"+FBU.zrleInStream.debugBuf());
        FBU.zrleInStream = null;
        FBU.bytes = 0;
        FBU.rects -= 1;
    //}
    return true;
}



// Get 'compact length' header and data size
getTightCLength = function (arr) 
{
    var header = 1, data = 0;
    data += arr[0] & 0x7f;
    if (arr[0] & 0x80) {
        header += 1;
        data += (arr[1] & 0x7f) << 7;
        if (arr[1] & 0x80) {
            header += 1;
            data += arr[2] << 14;
        }
    }
    return [header, data];
};

function display_tight(isTightPNG) 
{
    //Util.Debug(">> display_tight isTightPNG:"+isTightPNG);

    if (fb_depth === 1) {
        fail("Tight protocol handler only implements true color mode");
    }

    var ctl, cmode, clength, color, img, data;
    var filterId = -1, resetStreams = 0, streamId = -1;
    var rQ = ws.get_rQ(), rQi = ws.get_rQi(); 

    FBU.bytes = 1; // compression-control byte
    if (ws.rQwait("TIGHT compression-control", FBU.bytes)) { return false; }

    //========================================================

    var checksum = function(data) 
    {
        var sum=0, i;
        for (i=0; i<data.length;i++) {
            sum += data[i];
            if (sum > 65536) sum -= 65536;
        }
        return sum;
    }

    var decompress = function(data) 
    {
        for (var i=0; i<4; i++) {
            if ((resetStreams >> i) & 1) {
                FBU.zlibs[i].reset();
                Util.Info("Reset zlib stream " + i);
            }
        }
        var uncompressed = FBU.zlibs[streamId].uncompress(data, 0);
        if (uncompressed.status !== 0) {
            Util.Error("Invalid data in zlib stream");
        }
        //Util.Warn("Decompressed " + data.length + " to " +
        //    uncompressed.data.length + " checksums " +
        //    checksum(data) + ":" + checksum(uncompressed.data));

        return uncompressed.data;
    }

    var indexedToRGB = function (data, numColors, palette, width, height) {
        // Convert indexed (palette based) image data to RGB
        // TODO: reduce number of calculations inside loop
        var dest = [];
        var x, y, b, w, w1, dp, sp;
        if (numColors === 2) {
            w = Math.floor((width + 7) / 8);
            w1 = Math.floor(width / 8);
            for (y = 0; y < height; y++) {
                for (x = 0; x < w1; x++) {
                    for (b = 7; b >= 0; b--) {
                        dp = (y*width + x*8 + 7-b) * 3;
                        sp = (data[y*w + x] >> b & 1) * 3;
                        dest[dp  ] = palette[sp  ];
                        dest[dp+1] = palette[sp+1];
                        dest[dp+2] = palette[sp+2];
                    }
                }
                for (b = 7; b >= 8 - width % 8; b--) {
                    dp = (y*width + x*8 + 7-b) * 3;
                    sp = (data[y*w + x] >> b & 1) * 3;
                    dest[dp  ] = palette[sp  ];
                    dest[dp+1] = palette[sp+1];
                    dest[dp+2] = palette[sp+2];
                }
            }
        } else {
            for (y = 0; y < height; y++) {
                for (x = 0; x < width; x++) {
                    dp = (y*width + x) * 3;
                    sp = data[y*width + x] * 3;
                    dest[dp  ] = palette[sp  ];
                    dest[dp+1] = palette[sp+1];
                    dest[dp+2] = palette[sp+2];
                }
            }
        }
        return dest;
    };
    var handlePalette = function() {
        var numColors = rQ[rQi + 2] + 1;
        var paletteSize = numColors * fb_depth; 
        FBU.bytes += paletteSize;
        if (ws.rQwait("TIGHT palette " + cmode, FBU.bytes)) { return false; }

        var bpp = (numColors <= 2) ? 1 : 8;
        var rowSize = Math.floor((FBU.width * bpp + 7) / 8);
        var raw = false;
        if (rowSize * FBU.height < 12) {
            raw = true;
            clength = [0, rowSize * FBU.height];
        } else {
            clength = getTightCLength(ws.rQslice(3 + paletteSize,
                                                 3 + paletteSize + 3));
        }
        FBU.bytes += clength[0] + clength[1];
        if (ws.rQwait("TIGHT " + cmode, FBU.bytes)) { return false; }

        // Shift ctl, filter id, num colors, palette entries, and clength off
        ws.rQshiftBytes(3); 
        var palette = ws.rQshiftBytes(paletteSize);
        ws.rQshiftBytes(clength[0]);

        if (raw) {
            data = ws.rQshiftBytes(clength[1]);
        } else {
            data = decompress(ws.rQshiftBytes(clength[1]));
        }

        // Convert indexed (palette based) image data to RGB
        var rgb = indexedToRGB(data, numColors, palette, FBU.width, FBU.height);

        // Add it to the render queue
        display.renderQ_push({
                'type': 'blitRgb',
                'data': rgb,
                'x': FBU.x,
                'y': FBU.y,
                'width': FBU.width,
                'height': FBU.height});
        return true;
    }

    var handleCopy = function() 
    {
        var raw = false;
        var uncompressedSize = FBU.width * FBU.height * fb_depth;
        if (uncompressedSize < 12) {
            raw = true;
            clength = [0, uncompressedSize];
        } else {
            clength = getTightCLength(ws.rQslice(1, 4));
        }
        FBU.bytes = 1 + clength[0] + clength[1];
        if (ws.rQwait("TIGHT " + cmode, FBU.bytes)) { return false; }

        // Shift ctl, clength off
        ws.rQshiftBytes(1 + clength[0]);

        if (raw) 
        {
            data = ws.rQshiftBytes(clength[1]);
        } 
        else 
        {
            data = decompress(ws.rQshiftBytes(clength[1]));
        }

        display.renderQ_push({
                'type': 'blitRgb',
                'data': data,
                'x': FBU.x,
                'y': FBU.y,
                'width': FBU.width,
                'height': FBU.height});
        return true;
    }
    //===================================================

    ctl = ws.rQpeek8();

    // Keep tight reset bits
    resetStreams = ctl & 0xF;

    // Figure out filter
    ctl = ctl >> 4; 
    streamId = ctl & 0x3;

    if (ctl === 0x08)      cmode = "fill";
    else if (ctl === 0x09) cmode = "jpeg";
    else if (ctl === 0x0A) cmode = "png";
    else if (ctl & 0x04)   cmode = "filter";
    else if (ctl < 0x04)   cmode = "copy";
    else return fail("Illegal tight compression received, ctl: " + ctl);

    if (isTightPNG && (cmode === "filter" || cmode === "copy")) {
        return fail("filter/copy received in tightPNG mode");
    }

    switch (cmode) 
    {
        // fill uses fb_depth because TPIXELs drop the padding byte
        case "fill":   FBU.bytes += fb_depth; break; // TPIXEL
        case "jpeg":   FBU.bytes += 3;        break; // max clength
        case "png":    FBU.bytes += 3;        break; // max clength
        case "filter": FBU.bytes += 2;        break; // filter id + num colors if palette
        case "copy":                          break;
    }

    if (ws.rQwait("TIGHT " + cmode, FBU.bytes)) { return false; }

    //Util.Debug("   ws.rQslice(0,20): " + ws.rQslice(0,20) + " (" + ws.rQlen() + ")");
    //Util.Debug("   cmode: " + cmode);

    // Determine FBU.bytes
    switch (cmode) 
    {
    case "fill":
        ws.rQshift8(); // shift off ctl
        color = ws.rQshiftBytes(fb_depth);
        display.renderQ_push({
                'type': 'fill',
                'x': FBU.x,
                'y': FBU.y,
                'width': FBU.width,
                'height': FBU.height,
                'color': [color[2], color[1], color[0]] });
        break;
    case "png":
    case "jpeg":
        clength = getTightCLength(ws.rQslice(1, 4));
        FBU.bytes = 1 + clength[0] + clength[1]; // ctl + clength size + jpeg-data
        if (ws.rQwait("TIGHT " + cmode, FBU.bytes)) { return false; }

        // We have everything, render it
        //Util.Debug("   jpeg, ws.rQlen(): " + ws.rQlen() + ", clength[0]: " +
        //           clength[0] + ", clength[1]: " + clength[1]);
        ws.rQshiftBytes(1 + clength[0]); // shift off ctl + compact length
        img = new Image();
        img.src = "data:image/" + cmode +
            extract_data_uri(ws.rQshiftBytes(clength[1]));
        display.renderQ_push({
                'type': 'img',
                'img': img,
                'x': FBU.x,
                'y': FBU.y});
        img = null;
        break;
    case "filter":
        filterId = rQ[rQi + 1];
        if (filterId === 1) 
        {
            if (!handlePalette()) { return false; }
        } 
        else 
        {
            // Filter 0, Copy could be valid here, but servers don't send it as an explicit filter
            // Filter 2, Gradient is valid but not used if jpeg is enabled
            throw("Unsupported tight subencoding received, filter: " + filterId);
        }
        break;
    case "copy":
        if (!handleCopy()) { return false; }
        break;
    }

    FBU.bytes = 0;
    FBU.rects -= 1;
    //Util.Debug("   ending ws.rQslice(0,20): " + ws.rQslice(0,20) + " (" + ws.rQlen() + ")");
    //Util.Debug("<< display_tight_png");
    return true;
}

extract_data_uri = function(arr) 
{
    //var i, stra = [];
    //for (i=0; i< arr.length; i += 1) {
    //    stra.push(String.fromCharCode(arr[i]));
    //}
    //return "," + escape(stra.join(''));
    return ";base64," + Base64.encode(arr);
};

encHandlers.TIGHT = function () { return display_tight(false); };
encHandlers.TIGHT_PNG = function () { return display_tight(true); };

encHandlers.last_rect = function last_rect() {
    //Util.Debug(">> last_rect");
    FBU.rects = 0;
    //Util.Debug("<< last_rect");
    return true;
};

encHandlers.DesktopSize = function set_desktopsize() 
{
    Util.Debug(">> set_desktopsize");
    fb_width = FBU.width;
    fb_height = FBU.height;
    conf.onFBResize(that, fb_width, fb_height);
    display.resize(fb_width, fb_height);
    timing.fbu_rt_start = (new Date()).getTime();
    // Send a new non-incremental request
    ws.send(fbUpdateRequests());

    FBU.bytes = 0;
    FBU.rects -= 1;

    Util.Debug("<< set_desktopsize");
    return true;
};

encHandlers.Cursor = function set_cursor() 
{
    var x, y, w, h, pixelslength, masklength;
    //Util.Debug(">> set_cursor");
    x = FBU.x;  // hotspot-x
    y = FBU.y;  // hotspot-y
    w = FBU.width;
    h = FBU.height;

    pixelslength = w * h * fb_Bpp;
    masklength = Math.floor((w + 7) / 8) * h;

    FBU.bytes = pixelslength + masklength;
    if (ws.rQwait("cursor encoding", FBU.bytes)) { return false; }

    //Util.Debug("   set_cursor, x: " + x + ", y: " + y + ", w: " + w + ", h: " + h);

    display.changeCursor(ws.rQshiftBytes(pixelslength),
                            ws.rQshiftBytes(masklength),
                            x, y, w, h);

    FBU.bytes = 0;
    FBU.rects -= 1;

    //Util.Debug("<< set_cursor");
    return true;
};

encHandlers.JPEG_quality_lo = function set_jpeg_quality() 
{
    Util.Error("Server sent jpeg_quality pseudo-encoding");
};

encHandlers.compress_lo = function set_compress_level() 
{
    Util.Error("Server sent compress level pseudo-encoding");
};

/*
 * Client message routines
 */

pixelFormat = function() 
{
    //Util.Debug(">> pixelFormat");
    var arr;

    var format = PIXEL_FORMAT[Hundreds];
    fb_Bpp = format[0] / 8;
    colorDepth = format[1];
    zrlePixFactor = 24 / colorDepth;
    Util.Debug("---format:"+format);
    Util.Debug("---fb_Bpp:"+fb_Bpp);
    Util.Debug("--colorDepth:"+colorDepth);
    Util.Debug("--zrlePixFactor:"+zrlePixFactor);
// old MQ
    arr = [0];     // msg-type
    arr.push8(0);  // padding
    arr.push8(0);  // padding
    arr.push8(0);  // padding

    arr.push8(format[0]); // bits-per-pixel
    arr.push8(format[1]); // depth
    arr.push8(format[2]);  // little-endian
    arr.push8(format[3]);  // true-color

    arr.push16(format[4]);  // red-max
    arr.push16(format[5]);  // green-max
    arr.push16(format[6]);  // blue-max
    arr.push8(format[7]);    // red-shift
    arr.push8(format[8]);     // green-shift
    arr.push8(format[9]);     // blue-shift

    arr.push8(0);     // padding
    arr.push8(0);     // padding
    arr.push8(0);     // padding

    Util.Debug("<< pixelFormat:"+ arr);
    return arr;
};

clientEncodings = function() 
{
    //Util.Debug(">> clientEncodings");
    var arr, i, encList = [];

    for (i=0; i<encodings.length; i += 1) {
        if ((encodings[i][0] === "Cursor") &&
            (! conf.local_cursor)) {
            Util.Debug("Skipping Cursor pseudo-encoding");

        // TODO: remove this when we have tight+non-true-color
        } else if ((encodings[i][0] === "TIGHT") && 
                   (! conf.true_color)) {
            Util.Warn("Skipping tight, only support with true color");
        } else {
            Util.Debug("Adding encoding: " + encodings[i][0]+":"+encodings[i][1]);
            encList.push(encodings[i][1]);
        }
    }

    arr = [2];     // msg-type
    arr.push8(0);  // padding

    arr.push16(encList.length); // encoding count
    for (i=0; i < encList.length; i += 1) {
        arr.push32(encList[i]);
    }
    Util.Debug("<< clientEncodings: " + arr);
    return arr;
};

fbUpdateRequest = function(incremental, x, y, xw, yw) 
{
    //Util.Debug(">> fbUpdateRequest");
    if (typeof(x) === "undefined") { x = 0; }
    if (typeof(y) === "undefined") { y = 0; }
    if (typeof(xw) === "undefined") { xw = fb_width; }
    if (typeof(yw) === "undefined") { yw = fb_height; }
    //Util.Debug("update request=1====["+incremental+","+x+","+y+","+xw+","+yw+"]");
    var arr;
    arr = [3];  // msg-type
    arr.push8(incremental);
    arr.push16(x);
    arr.push16(y);
    arr.push16(xw);
    arr.push16(yw);
    //Util.Debug("<< fbUpdateRequest");
    return arr;
};

// Based on clean/dirty areas, generate requests to send
fbUpdateRequests = function() 
{
    var cleanDirty = display.getCleanDirtyReset(),
        arr = [], i, cb, db;

    cb = cleanDirty.cleanBox;
    if (cb.w > 0 && cb.h > 0) {
        // Request incremental for clean box
        arr = arr.concat(fbUpdateRequest(0, cb.x, cb.y, cb.w, cb.h));//MQ
    }
    for (i = 0; i < cleanDirty.dirtyBoxes.length; i++) {
        db = cleanDirty.dirtyBoxes[i];
        // Force all (non-incremental for dirty box
        arr = arr.concat(fbUpdateRequest(0, db.x, db.y, db.w, db.h));
    }
    return arr;
};



keyEvent = function(keysym, down) 
{
    //Util.Debug(">> keyEvent, keysym: " + keysym + ", down: " + down);
    var arr;
    arr = [4];  // msg-type
    arr.push8(down);
    arr.push16(0);
    arr.push32(keysym);
    //Util.Debug("<< keyEvent");
    return arr;
};

pointerEvent = function(x, y) 
{
    //Util.Debug(">> pointerEvent, x,y: " + x + "," + y +
     //          " , mask: " + mouse_buttonMask);
    var arr;
    arr = [5];  // msg-type
    arr.push8(mouse_buttonMask);
    arr.push16(x);
    arr.push16(y);
    //Util.Debug("<< pointerEvent");
    return arr;
};

clientCutText = function(text) 
{
    //Util.Debug(">> clientCutText");
    var arr, i, n;
    arr = [6];     // msg-type
    arr.push8(0);  // padding
    arr.push8(0);  // padding
    arr.push8(0);  // padding
    arr.push32(text.length);
    n = text.length;
    for (i=0; i < n; i+=1) {
        arr.push(text.charCodeAt(i));
    }
    //Util.Debug("<< clientCutText:" + arr);
    return arr;
};



//
// Public API interface functions
//
////////////////////////////////////////////////////////////////
that.connect = function(host, port, password, path) 
{
    Util.Debug(">> connect");

    rfb_host       = host;
    rfb_port       = port;
    rfb_password   = (password !== undefined)   ? password : "";
    rfb_path       = (path !== undefined) ? path : "";

    if ((!rfb_host) || (!rfb_port)) {
        return fail("Must set host and port");
    }

    updateState('connect');
    Util.Debug("<< connect");

};

that.disconnect = function() 
{
    Util.Debug(">> disconnect");
    updateState('disconnect', 'Disconnecting');
    Util.Debug("<< disconnect");
};

that.sendPassword = function(passwd) {
    rfb_password = passwd;
    rfb_state = "Authentication";
    setTimeout(init_msg, 1);
};

that.refresh = function() {
    if (rfb_state !== "normal") { return false; };
    Util.Info("Sending refresh requests");
    ws.send(fbUpdateRequest(0, 0, 0, fb_width, fb_height));
}

that.sendCtrlAltDel = function() 
{
    if (rfb_state !== "normal" || conf.view_only) { return false; }
    Util.Info("Sending Ctrl-Alt-Del");
    var arr = [];
    arr = arr.concat(keyEvent(0xFFE3, 1)); // Control
    arr = arr.concat(keyEvent(0xFFE9, 1)); // Alt
    arr = arr.concat(keyEvent(0xFFFF, 1)); // Delete
    arr = arr.concat(keyEvent(0xFFFF, 0)); // Delete
    arr = arr.concat(keyEvent(0xFFE9, 0)); // Alt
    arr = arr.concat(keyEvent(0xFFE3, 0)); // Control
    arr = arr.concat(fbUpdateRequests());
    ws.send(arr);
};

// Send a key press. If 'down' is not specified then send a down key
// followed by an up key.
that.sendKey = function(code, down) 
{
    if (rfb_state !== "normal" || conf.view_only) { return false; }
    var arr = [];
    if (typeof down !== 'undefined') {
        //Util.Info("Sending key code (" + (down ? "down" : "up") + "): " + code);
        arr = arr.concat(keyEvent(code, down ? 1 : 0));
    } else {
        //Util.Info("Sending key code (down + up): " + code);
        arr = arr.concat(keyEvent(code, 1));
        arr = arr.concat(keyEvent(code, 0));
    }
    arr = arr.concat(fbUpdateRequests());
    ws.send(arr);
};

that.clipboardPasteFrom = function(text) 
{
    if (rfb_state !== "normal") { return; }
    //Util.Debug(">> clipboardPasteFrom: " + text.substr(0,40) + "...");
    ws.send(clientCutText(text));
    //Util.Debug("<< clipboardPasteFrom");
};

// Override internal functions for testing
that.testMode = function(override_send, data_mode) {
    test_mode = true;
    that.recv_message = ws.testMode(override_send, data_mode);

    checkEvents = function () { /* Stub Out */ };
    that.connect = function(host, port, password) {
            rfb_host = host;
            rfb_port = port;
            rfb_password = password;
            init_vars();
            updateState('ProtocolVersion', "Starting VNC handshake");
        };
};
//////////////////////////////////////////////////////////////////////////
//End Public API interface functions
//


return constructor();  // Return the public API interface

}  // End of RFB()
