LOCAL_PATH:= $(call my-dir)

include $(LOCAL_PATH)/vnc_server.xml

include $(CLEAR_VARS)


LOCAL_CFLAGS  +=  -Wall \
									-O3 \
									-DLIBVNCSERVER_WITH_WEBSOCKETS \
									-DLIBVNCSERVER_HAVE_LIBPNG \
									-DLIBVNCSERVER_HAVE_ZLIB \
									-DLIBVNCSERVER_HAVE_LIBJPEG

LOCAL_LDLIBS +=  -llog -lz -ldl 

LOCAL_SRC_FILES += \
									 droidvncserver.c \
									 gui.c \
									 inputMethods/input.c \
									 screenMethods/adb.c \
									 screenMethods/framebuffer.c \
									 screenMethods/gralloc.c \
									 screenMethods/flinger.c \
									 suinput/suinput.c 

LOCAL_C_INCLUDES += \
										$(LOCAL_PATH) \
										$(LOCAL_PATH)/screenMethods \
										$(LOCAL_PATH)/inputMethods \
										$(LOCAL_PATH)/suinput \
										$(LOCAL_PATH)/cutils \
										$(LOCAL_PATH)/../libpng \
										$(LOCAL_PATH)/../jpeg \
										$(LOCAL_PATH)/../jpeg-turbo \
										$(LOCAL_PATH)/../openssl/include \
										$(LOCAL_PATH)/$(LIBVNCSERVER_ROOT)/libvncserver \
										$(LOCAL_PATH)/$(LIBVNCSERVER_ROOT)/common \
										$(LOCAL_PATH)/$(LIBVNCSERVER_ROOT)/rfb \
										$(LOCAL_PATH)/$(LIBVNCSERVER_ROOT)/ 

LOCAL_STATIC_LIBRARIES := libjpeg libpng libssl_static libcrypto_static libvncserver

LOCAL_SHARED_LIBRARIES : = \
	libcutils \

LOCAL_MODULE := androidvncserver

include $(BUILD_EXECUTABLE)
