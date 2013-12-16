/*
suinput - Simple C-API to the Linux uinput-system.
Copyright (C) 2009 Tuomas Räsänen <tuos@codegrove.org>

This library is free software; you can redistribute it and/or
modify it under the terms of the GNU Lesser General Public
License as published by the Free Software Foundation; either
version 3 of the License, or (at your option) any later version.

This library is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
Lesser General Public License for more details.

You should have received a copy of the GNU Lesser General Public
License along with this library; if not, write to the Free Software
Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA  02110-1301  USA
*/

#include <errno.h>
#include <string.h>
#include <fcntl.h>
#include <unistd.h>
#include <linux/uinput.h>
#include <stdio.h>
#include "suinput.h"

char* UINPUT_FILEPATHS[] = {
    "/android/dev/uinput",
    "/dev/input/misc",
    "/dev/uinput",
    "/dev/input/uinput",
    "/dev/misc/uinput",
};
#define UINPUT_FILEPATHS_COUNT (sizeof(UINPUT_FILEPATHS) / sizeof(char*))

int suinput_write(int uinput_fd,
                  uint16_t type, uint16_t code, int32_t value)
{
    //L("GET_EVENT--suinput_write---%d, %d, %d \n", type, code, value);
    struct input_event event;
    memset(&event, 0, sizeof(event));
    gettimeofday(&event.time, 0); /* This should not be able to fail ever.. */
    event.type = type;
    event.code = code;
    event.value = value;
    if (write(uinput_fd, &event, sizeof(event)) != sizeof(event))
        return -1;
    return 0;
}

int suinput_write_syn(int uinput_fd,
                             uint16_t type, uint16_t code, int32_t value)
{
    //L("GET_EVENT--suinput_write_syn---%d, %d, %d \n", type, code, value);
    if (suinput_write(uinput_fd, type, code, value))
        return -1;
    return suinput_write(uinput_fd, EV_SYN, SYN_REPORT, 0);
}

int suinput_open(const char* device_name, const struct input_id* id)
{
    L("---suinput_open...---\n");
    int original_errno = 0;
    int uinput_fd = -1;
    struct uinput_user_dev user_dev;
    int i;

    for (i = 0; i < UINPUT_FILEPATHS_COUNT; ++i) {
        //open input device file...1
        uinput_fd = open(UINPUT_FILEPATHS[i], O_WRONLY | O_NONBLOCK);
        L("open file:%s \n",UINPUT_FILEPATHS[i]);
        if (uinput_fd != -1) {//check if open failed!....
            L("open successed! \n");
            break;
        }
        L("open failed! \n");
    }

    if (uinput_fd == -1)
        return -1;



    /* Set device to handle following types of events: */
////////////////////////////////////////////////////////////////////////////
    /* Key and button events */
    L("UI_SET_EVBIT===EV_KEY \n");
     if (ioctl(uinput_fd, UI_SET_EVBIT, EV_KEY) == -1) {
        L("==err==1");
         goto err;
     }
// 
//     /* Key and button repetition events */
    L("UI_SET_EVBIT===EV_REP \n");
     if (ioctl(uinput_fd, UI_SET_EVBIT, EV_REP) == -1) {
        L("==err==2");
         goto err;
     }
//     
//     /* Relative pointer motions */
//     if (ioctl(uinput_fd, UI_SET_EVBIT, EV_REL) == -1)
//         goto err;

    /* Absolute pointer motions */
    L("UI_SET_EVBIT===EV_ABS \n");
    if (ioctl(uinput_fd, UI_SET_EVBIT, EV_ABS) == -1) {
        L("==err==3");
        goto err;
    }

    /* Synchronization events, this is probably set implicitely too. */
    L("UI_SET_EVBIT===EV_SYN \n");
    if (ioctl(uinput_fd, UI_SET_EVBIT, EV_SYN) == -1) {
        L("==err==4");
        goto err;
    }
//////////////////////////////////////////////////////////////////////////////////////


    /* Configure device to handle relative x and y axis. */
//     if (ioctl(uinput_fd, UI_SET_RELBIT, REL_X) == -1)
//         goto err;
//     if (ioctl(uinput_fd, UI_SET_RELBIT, REL_Y) == -1)
//         goto err;

    /* Configure device to handle absolute x and y axis. */
    L("UI_SET_ABSBIT===ABS_X \n");
    if (ioctl(uinput_fd, UI_SET_ABSBIT, ABS_X) == -1) {
        L("==err==5");
        goto err;
    }
    L("UI_SET_ABSBIT===ABS_Y \n");
    if (ioctl(uinput_fd, UI_SET_ABSBIT, ABS_Y) == -1) {
        L("==err==6");
        goto err;
    }

    

    /* Configure device to handle all keys, see linux/input.h. */
    ///////////////////////////////////////////////////////////////////
    L("UI_SET_KEYBIT===modified=key max:%d \n", KEY_MAX);
    /*
    for (i = 0; i < KEY_MAX; i++) {
        if (ioctl(uinput_fd, UI_SET_KEYBIT, i) == -1) {
            L("==err==7");
            goto err;
        }
    }
    */
/*
    for (i = 0; i < 256; i++) {
        if (ioctl(uinput_fd, UI_SET_KEYBIT, i) == -1) {
            goto err;
        }
    }
    */

    if (ioctl(uinput_fd, UI_SET_KEYBIT, BTN_MOUSE) == -1) {
        goto err;
    }

    if (ioctl(uinput_fd, UI_SET_KEYBIT, BTN_TOUCH) == -1) {
        goto err;
    }

    if (ioctl(uinput_fd, UI_SET_KEYBIT, BTN_LEFT) == -1) {
        goto err;
    }

    if (ioctl(uinput_fd, UI_SET_KEYBIT, BTN_MIDDLE) == -1) {
        goto err;
    }

    if (ioctl(uinput_fd, UI_SET_KEYBIT, BTN_RIGHT) == -1) {
        goto err;
    }
    ///////////////////////////////////////////////////////////////////////

    /* Set device-specific information. */
    memset(&user_dev, 0, sizeof(user_dev));
    strncpy(user_dev.name, device_name, UINPUT_MAX_NAME_SIZE);
    user_dev.id.bustype = id->bustype;
    user_dev.id.vendor = id->vendor;
    user_dev.id.product = id->product;
    user_dev.id.version = id->version;

    //minor tweak to support ABSolute events
    user_dev.absmin[ABS_X] = -2047;
    user_dev.absmax[ABS_X] = 2048;
    user_dev.absfuzz[ABS_X] = 0;
    user_dev.absflat[ABS_X] = 0;

    user_dev.absmin[ABS_Y] = -2047;
    user_dev.absmax[ABS_Y] = 2048;
    user_dev.absfuzz[ABS_Y] = 0;
    user_dev.absflat[ABS_Y] = 0;

    if (write(uinput_fd, &user_dev, sizeof(user_dev)) != sizeof(user_dev)) {
        L("==err==8");
        goto err;
    }


    if (ioctl(uinput_fd, UI_DEV_CREATE) == -1) {
        L("==err==9");
        goto err;
    }

    /*
  The reason for generating a small delay is that creating succesfully
  an uinput device does not guarantee that the device is ready to process
  input events. It's probably due the asynchronous nature of the udev.
  However, my experiments show that the device is not ready to process input
  events even after a device creation event is received from udev.
  */

    //sleep(2);

    return uinput_fd;

    err:

    /*
    At this point, errno is set for some reason. However, cleanup-actions
    can also fail and reset errno, therefore we store the original one
    and reset it before returning.
  */
    original_errno = errno;

    /* Cleanup. */
    close(uinput_fd); /* Might fail, but we don't care anymore at this point. */

    errno = original_errno;
    return -1;
}

int suinput_close(int uinput_fd)
{
    /*
    Sleep before destroying the device because there still can be some
    unprocessed events. This is not the right way, but I am still
    looking for better ways. The question is: how to know whether there
    are any unprocessed uinput events?
   */
    sleep(2);

    if (ioctl(uinput_fd, UI_DEV_DESTROY) == -1) {
        close(uinput_fd);
        return -1;
    }

    if (close(uinput_fd) == -1)
        return -1;

    return 0;
}

int suinput_move_pointer(int uinput_fd, int32_t x, int32_t y)
{
    if (suinput_write(uinput_fd, EV_REL, REL_X, x))
        return -1;
    return suinput_write_syn(uinput_fd, EV_REL, REL_Y, y);
}

int suinput_set_pointer(int uinput_fd, int32_t x, int32_t y)
{
    if (suinput_write(uinput_fd, EV_ABS, ABS_X, x))
        return -1;
    return suinput_write_syn(uinput_fd, EV_ABS, ABS_Y, y);
}

int suinput_press(int uinput_fd, uint16_t code)
{
    //L("KEY_EVENT--suinput_press--code:%d \n");
    return suinput_write_syn(uinput_fd, EV_KEY, code, 1);//modified for KeyEvent MQ
}

int suinput_release(int uinput_fd, uint16_t code)
{
    //L("KEY_EVENT--suinput_release--code:%d \n");
    return suinput_write_syn(uinput_fd, EV_KEY, code, 0);//modified for KeyEvent MQ
}

int suinput_click(int uinput_fd, uint16_t code)
{
    if (suinput_press(uinput_fd, code))
        return -1;
    return suinput_release(uinput_fd, code);
}
