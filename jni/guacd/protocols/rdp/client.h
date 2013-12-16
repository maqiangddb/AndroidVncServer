
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

#ifndef _GUAC_RDP_CLIENT_H
#define _GUAC_RDP_CLIENT_H

#include <pthread.h>

#include <cairo/cairo.h>

#include <freerdp/freerdp.h>
#include <freerdp/codec/color.h>

#include <guacamole/client.h>

#include "audio.h"
#include "rdp_keymap.h"
#include "rdp_settings.h"

/**
 * The maximum duration of a frame in milliseconds.
 */
#define GUAC_RDP_FRAME_DURATION 40

/**
 * The amount of time to allow per message read within a frame, in
 * milliseconds. If the server is silent for at least this amount of time, the
 * frame will be considered finished.
 */
#define GUAC_RDP_FRAME_TIMEOUT 0

/**
 * Client data that will remain accessible through the guac_client.
 * This should generally include data commonly used by Guacamole handlers.
 */
typedef struct rdp_guac_client_data {

    /**
     * Pointer to the FreeRDP client instance handling the current connection.
     */
    freerdp* rdp_inst;

    /**
     * All settings associated with the current or pending RDP connection.
     */
    guac_rdp_settings settings;

    /**
     * Button mask containing the OR'd value of all currently pressed buttons.
     */
    int mouse_button_mask;

    /**
     * Cairo surface which will receive all TRANSPARENT glyphs.
     */
    cairo_surface_t* trans_glyph_surface;

    /**
     * Cairo surface which will receive all OPAQUE glyphs.
     */
    cairo_surface_t* opaque_glyph_surface;

    /**
     * The current Cairo surface which will receive all drawn glyphs,
     * depending on whether we are currently drawing transparent or
     * opaque glyphs.
     */
    cairo_surface_t* glyph_surface;

    /**
     * Cairo instance for drawing to the current glyph surface.
     */
    cairo_t* glyph_cairo;

    /**
     * The Guacamole layer that GDI operations should draw to. RDP messages
     * exist which change this surface to allow drawing to occur off-screen.
     */
    const guac_layer* current_surface;

    /**
     * Whether graphical operations are restricted to a specific bounding
     * rectangle.
     */
    int bounded;

    /**
     * The X coordinate of the upper-left corner of the bounding rectangle,
     * if any.
     */
    int bounds_left;

    /**
     * The Y coordinate of the upper-left corner of the bounding rectangle,
     * if any.
     */
    int bounds_top;

    /**
     * The X coordinate of the lower-right corner of the bounding rectangle,
     * if any.
     */
    int bounds_right;

    /**
     * The Y coordinate of the lower-right corner of the bounding rectangle,
     * if any.
     */
    int bounds_bottom;

    /**
     * The keymap to use when translating keysyms into scancodes or sequences
     * of scancodes for RDP.
     */
    guac_rdp_static_keymap keymap;

    /**
     * The state of all keys, based on whether events for pressing/releasing
     * particular keysyms have been received. This is necessary in order to
     * determine which keys must be released/pressed when a particular
     * keysym can only be typed through a sequence of scancodes (such as
     * an Alt-code) because the server-side keymap does not support that
     * keysym.
     */
    guac_rdp_keysym_state_map keysym_state;

    /**
     * The current text (NOT Unicode) clipboard contents.
     */
    char* clipboard;

    /**
     * Audio output, if any.
     */
    audio_stream* audio;

    /**
     * Lock which is locked and unlocked for each RDP message.
     */
    pthread_mutex_t rdp_lock;

    pthread_mutexattr_t attributes;

} rdp_guac_client_data;

/**
 * Client data that will remain accessible through the RDP context.
 * This should generally include data commonly used by FreeRDP handlers.
 */
typedef struct rdp_freerdp_context {

    /**
     * The parent context. THIS MUST BE THE FIRST ELEMENT.
     */
    rdpContext _p;

    /**
     * Pointer to the guac_client instance handling the RDP connection with
     * this context.
     */
    guac_client* client;

    /**
     * Color conversion structure to be used to convert RDP images to PNGs.
     */
    CLRCONV* clrconv;

} rdp_freerdp_context;

/**
 * Given the coordinates and dimensions of a rectangle, clips the rectangle to be
 * within the clipping bounds of the client data, if clipping is active.
 *
 * Returns 0 if the rectangle given is visible at all, and 1 if the entire
 * rectangls is outside the clipping rectangle and this invisible.
 */
int guac_rdp_clip_rect(rdp_guac_client_data* data, int* x, int* y, int* w, int* h);

#endif

