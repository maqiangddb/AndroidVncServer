
/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is libguac-client-rdp.
 *
 * The Initial Developer of the Original Code is
 * Michael Jumper.
 * Portions created by the Initial Developer are Copyright (C) 2011
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */

#ifndef __GUAC_RDPDR_SERVICE_H
#define __GUAC_RDPDR_SERVICE_H

#include <pthread.h>

#ifdef ENABLE_WINPR
#include <winpr/stream.h>
#else
#include "compat/winpr-stream.h"
#endif

#include <guacamole/client.h>

typedef struct guac_rdpdrPlugin guac_rdpdrPlugin;
typedef struct guac_rdpdr_device guac_rdpdr_device;

/**
 * Handler for client device list announce. Each implementing device must write
 * its announcement header and data to the given output stream.
 */
typedef void guac_rdpdr_device_announce_handler(guac_rdpdr_device* device, wStream* output_stream,
        int device_id);

/**
 * Handler for device I/O requests.
 */
typedef void guac_rdpdr_device_iorequest_handler(guac_rdpdr_device* device,
        wStream* input_stream, int file_id, int completion_id, int major_func, int minor_func);

/**
 * Handler for cleaning up the dynamically-allocated portions of a device.
 */
typedef void guac_rdpdr_device_free_handler(guac_rdpdr_device* device);

/**
 * Arbitrary device forwarded over the RDPDR channel.
 */
struct guac_rdpdr_device {

    /**
     * The RDPDR plugin owning this device.
     */
    guac_rdpdrPlugin* rdpdr;

    /**
     * The ID assigned to this device by the RDPDR plugin.
     */
    int device_id;

    /**
     * An arbitrary device name, used for logging purposes only.
     */
    const char* device_name;

    /**
     * Handler which will be called when the RDPDR plugin is forming the client
     * device announce list.
     */
    guac_rdpdr_device_announce_handler* announce_handler;

    /**
     * Handler which should be called for every I/O request received.
     */
    guac_rdpdr_device_iorequest_handler* iorequest_handler;

    /**
     * Handlel which should be called when the device is being free'd.
     */
    guac_rdpdr_device_free_handler* free_handler;

    /**
     * Arbitrary data, used internally by the handlers for this device.
     */
    void* data;

};


/**
 * Structure representing the current state of the Guacamole RDPDR plugin for
 * FreeRDP.
 */
struct guac_rdpdrPlugin {

    /**
     * The FreeRDP parts of this plugin. This absolutely MUST be first.
     * FreeRDP depends on accessing this structure as if it were an instance
     * of rdpSvcPlugin.
     */
    rdpSvcPlugin plugin;

    /**
     * Reference to the client owning this instance of the RDPDR plugin.
     */
    guac_client* client;

    /**
     * The number of devices registered within the devices array.
     */
    int devices_registered;

    /**
     * Array of registered devices.
     */
    guac_rdpdr_device devices[8];

};


/**
 * Handler called when this plugin is loaded by FreeRDP.
 */
void guac_rdpdr_process_connect(rdpSvcPlugin* plugin);

/**
 * Handler called when this plugin receives data along its designated channel.
 */
void guac_rdpdr_process_receive(rdpSvcPlugin* plugin,
        wStream* input_stream);

/**
 * Handler called when this plugin is being unloaded.
 */
void guac_rdpdr_process_terminate(rdpSvcPlugin* plugin);

/**
 * Handler called when this plugin receives an event. For the sake of RDPDR,
 * all events will be ignored and simply free'd.
 */
void guac_rdpdr_process_event(rdpSvcPlugin* plugin, wMessage* event);

#endif

