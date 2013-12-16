
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
 * The Original Code is libguac.
 *
 * The Initial Developer of the Original Code is
 * Michael Jumper.
 * Portions created by the Initial Developer are Copyright (C) 2010
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

#ifndef _GUAC_UNICODE_H
#define _GUAC_UNICODE_H

#include <stddef.h>

/**
 * Provides functions for manipulating Unicode strings.
 *
 * @file unicode.h
 */

/**
 * Given the initial byte of a single UTF-8 character, returns the overall
 * byte size of the entire character.
 *
 * @param c The initial byte of the character to check.
 * @return The number of bytes in the given character overall.
 */
size_t guac_utf8_charsize(unsigned char c);

/**
 * Given a UTF-8-encoded string, returns the length of the string in characters
 * (not bytes).
 *
 * @param str The UTF-8 string to calculate the length of.
 * @return The length in characters of the given UTF-8 string.
 */
size_t guac_utf8_strlen(const char* str);

/**
 * Given destination buffer and its length, writes the given codepoint as UTF-8
 * to the buffer, returning the number of bytes written. If there is not enough
 * space in the buffer to write the character, no bytes are written at all.
 *
 * @param codepoint The Unicode codepoint to write to the buffer.
 * @param utf8 The buffer to write to.
 * @param length The length of the buffer, in bytes.
 * @return The number of bytes written, which may be zero if there is not
 *         enough space in the buffer to write the UTF-8 character.
 */
int guac_utf8_write(int codepoint, char* utf8, int length);

/**
 * Given a buffer containing UTF-8 characters, reads the first codepoint in the
 * buffer, returning the length of the codepoint in bytes. If no codepoint
 * could be read, zero is returned.
 *
 * @param utf8 A buffer containing UTF-8 characters.
 * @param length The length of the buffer, in bytes.
 * @param codepoint A pointer to an integer which will contain the codepoint
 *                  read, if any. If no character can be read, the integer
 *                  will be left untouched.
 * @return The number of bytes read, which may be zero if there is not enough
 *         space in the buffer to read a character.
 */
int guac_utf8_read(const char* utf8, int length, int* codepoint);

#endif

