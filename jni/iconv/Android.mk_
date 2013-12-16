LOCAL_PATH:= $(call my-dir)


include $(CLEAR_VARS)

LOCAL_MODULE := iconv

LOCAL_CFLAGS := \
  -Wno-multichar \
  -D_ANDROID \
  -DLIBDIR="c" \
  -DBUILDING_LIBICONV \
  -DIN_LIBRARY


LOCAL_C_INCLUDES := \
  $(LOCAL_PATH) \
  $(LOCAL_PATH)/include \
  $(LOCAL_PATH)/lib \
  $(LOCAL_PATH)/libcharset/include
    
LOCAL_SRC_FILES := \
  libcharset/lib/localcharset.c \
  lib/iconv.c \
  lib/relocatable.c

include $(BUILD_STATIC_LIBRARY)