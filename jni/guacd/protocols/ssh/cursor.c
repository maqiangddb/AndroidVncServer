
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
 * The Original Code is libguac-client-ssh.
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

#include <stdlib.h>

#include <guacamole/client.h>
#include <guacamole/protocol.h>

#include "cursor.h"

guac_ssh_cursor* guac_ssh_cursor_alloc(guac_client* client) {

    /* Alloc new cursor, initialize buffer */
    guac_ssh_cursor* cursor = malloc(sizeof(guac_ssh_cursor));
    cursor->buffer = guac_client_alloc_buffer(client);

    return cursor;

}

void guac_ssh_cursor_free(guac_client* client, guac_ssh_cursor* cursor) {

    /* Free buffer */
    guac_client_free_buffer(client, cursor->buffer);

    /* Free cursor */
    free(cursor);

}

void guac_ssh_set_cursor(guac_client* client, guac_ssh_cursor* cursor) {

    /* Set cursor */
    guac_protocol_send_cursor(client->socket,
            cursor->hotspot_x, cursor->hotspot_y,
            cursor->buffer,
            0, 0, cursor->width, cursor->height);

}

