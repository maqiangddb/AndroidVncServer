LOCAL_PATH := $(call my-dir)
ROOT_DIR := $(LOCAL_PATH)

LIBGUACD_SRC = \
    guacd/daemon.c  \
    guacd/client.c  \
    guacd/log.c         \
    libguac/audio.c           \
    libguac/client.c          \
    libguac/client-handlers.c \
    libguac/error.c           \
    libguac/hash.c            \
    libguac/instruction.c     \
    libguac/palette.c         \
    libguac/plugin.c          \
    libguac/pool.c            \
    libguac/protocol.c        \
    libguac/socket.c          \
    libguac/socket-fd.c       \
    libguac/socket-nest.c     \
    libguac/timestamp.c       \
    libguac/unicode.c         \
    libguac/wav_encoder.c   \
    protocols/vnc/client.c                    \
    protocols/vnc/convert.c                   \
    protocols/vnc/guac_handlers.c             \
    protocols/vnc/vnc_handlers.c

include $(ROOT_DIR)/pixman.mk
include $(ROOT_DIR)/cairo.mk
include $(CLEAR_VARS)

LOCAL_MODULE    := libguac
LOCAL_CFLAGS    := -O2 --std=c99 -I. -Ijni/guacd/pixman/pixman -Ijni/guacd/cairo/src -Ijni/guacd/cairo-extra -Ijni/guacd/pixman-extra -Wno-missing-field-initializers
LOCAL_LDLIBS    := -ljnigraphics -lm -llog 
#-ljnigraphics
#-L /cygdrive/d/android/ndk/platforms/android-18/arch-arm/usr/lib

LOCAL_SRC_FILES := $(LIBGUACD_SRC)


libguac_includes := $(ROOT_DIR)/guacd

libguac_includes +=         \
    $(ROOT_DIR)/libguac     \
    $(ROOT_DIR)/libguac/guacamole

libguac_includes +=    \
    $(ROOT_DIR)/protocols/vnc

libguac_includes +=     \
    $(ROOT_DIR)/cairo/src     \
    $(ROOT_DIR)/cairo-extra   \
    $(ROOT_DIR)/../libpng   \
    $(ROOT_DIR)/../iconv/include   \
    $(ROOT_DIR)/../vnc/LibVNCServer-0.9.9/rfb   \
    $(ROOT_DIR)/../vnc/LibVNCServer-0.9.9/libvncserver   \
    $(ROOT_DIR)/../vnc/LibVNCServer-0.9.9/common   \
    $(ROOT_DIR)/../vnc/LibVNCServer-0.9.9

LOCAL_C_INCLUDES := \
    $(libguac_includes)

LOCAL_STATIC_LIBRARIES := libcairo libpixman cpufeatures libpng libvncserver iconv

include $(BUILD_EXECUTABLE)

$(call import-module,android/cpufeatures)
