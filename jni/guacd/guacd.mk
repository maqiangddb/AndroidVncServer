LIBGUACD_SRC = \
    guacd/daemon.c  \
    guacd/client.c  \
    guacd/log.c 		\
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
    libguac/wav_encoder.c 	\
    protocols/vnc/client.c                    \
    protocols/vnc/convert.c                   \
    protocols/vnc/guac_handlers.c             \
    protocols/vnc/vnc_handlers.c

include $(CLEAR_VARS)

LOCAL_MODULE := libguacd
LOCAL_SRC_FILES := $(LIBGUACD_SRC)

LOBAL_STATIC_LIBRARIES := libcairo libpixman libpng

include $(BUILD_STATIC_LIBRARY)