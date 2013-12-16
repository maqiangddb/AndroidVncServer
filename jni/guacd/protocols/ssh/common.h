
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

#ifndef _SSH_GUAC_COMMON_H
#define _SSH_GUAC_COMMON_H

#include <stdbool.h>

/**
 * Returns the closest value to the value given that is also
 * within the given range.
 */
int guac_terminal_fit_to_range(int value, int min, int max);

/**
 * Encodes the given codepoint as UTF-8, storing the result within the
 * provided buffer, and returning the number of bytes stored.
 */
int guac_terminal_encode_utf8(int codepoint, char* utf8);

/**
 * Returns whether a codepoint has a corresponding glyph, or is rendered
 * as a blank space.
 */
bool guac_terminal_has_glyph(int codepoint);

/**
 * Similar to write, but automatically retries the write operation until
 * an error occurs.
 */
int guac_terminal_write_all(int fd, const char* buffer, int size);

#endif

