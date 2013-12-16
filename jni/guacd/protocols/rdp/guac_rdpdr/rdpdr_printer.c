
#include <errno.h>

#ifdef ENABLE_WINPR
#include <winpr/stream.h>
#else
#include "compat/winpr-stream.h"
#endif

#include <freerdp/utils/svc_plugin.h>

#include <guacamole/protocol.h>

#include "rdpdr_messages.h"
#include "rdpdr_printer.h"
#include "rdpdr_service.h"
#include "client.h"

/* Command to run GhostScript safely as a filter writing PDF */
char* const guac_rdpdr_pdf_filter_command[] = {
    "gs",
    "-q",
    "-dNOPAUSE",
    "-dBATCH",
    "-dSAFER",
    "-dPARANOIDSAFER",
    "-sDEVICE=pdfwrite",
    "-sOutputFile=-",
    "-c",
    ".setpdfwrite",
    "-f",
    "-",
    NULL
};

static void* guac_rdpdr_print_filter_output_thread(void* data) {

    guac_rdpdr_device* device = (guac_rdpdr_device*) data;
    guac_rdpdr_printer_data* printer_data = (guac_rdpdr_printer_data*) device->data;

    int length;
    char buffer[8192];

    /* Write all output as blobs */
    while ((length = read(printer_data->printer_output, buffer, sizeof(buffer))) > 0)
        guac_protocol_send_blob(device->rdpdr->client->socket,
                GUAC_RDPDR_PRINTER_BLOB, buffer, length);

    /* Log any error */
    if (length < 0)
        guac_client_log_error(device->rdpdr->client, "Error reading from filter: %s", strerror(errno));

    return NULL;

}

static int guac_rdpdr_create_print_process(guac_rdpdr_device* device) {

    guac_rdpdr_printer_data* printer_data = (guac_rdpdr_printer_data*) device->data;

    int child_pid;
    int stdin_pipe[2];
    int stdout_pipe[2];

    /* Create STDIN pipe */
    if (pipe(stdin_pipe)) {
        guac_client_log_error(device->rdpdr->client,
                "Unable to create STDIN pipe for PDF filter process: %s", strerror(errno));
        return 1;
    }

    /* Create STDOUT pipe */
    if (pipe(stdout_pipe)) {
        guac_client_log_error(device->rdpdr->client,
                "Unable to create STDIN pipe for PDF filter process: %s", strerror(errno));
        close(stdin_pipe[0]);
        close(stdin_pipe[1]);
        return 1;
    }

    /* Store our side of stdin/stdout */
    printer_data->printer_input  = stdin_pipe[1];
    printer_data->printer_output = stdout_pipe[0];

    /* Start output thread */
    if (pthread_create(&(printer_data->printer_output_thread), NULL, guac_rdpdr_print_filter_output_thread, device)) {
        guac_client_log_error(device->rdpdr->client, "Unable to fork PDF filter process");
        close(stdin_pipe[0]);
        close(stdin_pipe[1]);
        close(stdout_pipe[0]);
        close(stdout_pipe[1]);
        return 1;
    }

    /* Fork child process */
    child_pid = fork();

    /* Log fork errors */
    if (child_pid == -1) {
        guac_client_log_error(device->rdpdr->client,
                "Unable to fork PDF filter process: %s", strerror(errno));
        close(stdin_pipe[0]);
        close(stdin_pipe[1]);
        close(stdout_pipe[0]);
        close(stdout_pipe[1]);
        return 1;
    }

    /* Child process */
    if (child_pid == 0) {

        /* Close unneeded ends of pipe */
        close(stdin_pipe[1]);
        close(stdout_pipe[0]);

        /* Reassign file descriptors as STDIN/STDOUT */
        dup2(stdin_pipe[0], STDIN_FILENO);
        dup2(stdout_pipe[1], STDOUT_FILENO);

        /* Run PDF filter */
        guac_client_log_info(device->rdpdr->client, "Running %s", guac_rdpdr_pdf_filter_command[0]);
        if (execvp(guac_rdpdr_pdf_filter_command[0], guac_rdpdr_pdf_filter_command) < 0)
            guac_client_log_error(device->rdpdr->client, "Unable to execute PDF filter command: %s", strerror(errno));
        else
            guac_client_log_error(device->rdpdr->client, "Unable to execute PDF filter command, but no error given");

        /* Terminate child process */
        exit(1);

    }

    /* Log fork success */
    guac_client_log_info(device->rdpdr->client, "Created PDF filter process PID=%i", child_pid);

    /* Close unneeded ends of pipe */
    close(stdin_pipe[0]);
    close(stdout_pipe[1]);
    return 0;

}

void guac_rdpdr_process_print_job_create(guac_rdpdr_device* device,
        wStream* input_stream, int completion_id) {

    guac_rdpdr_printer_data* printer_data = (guac_rdpdr_printer_data*) device->data;
    wStream* output_stream = Stream_New(NULL, 24);

    /* No bytes received yet */
    printer_data->bytes_received = 0;

    /* Write header */
    Stream_Write_UINT16(output_stream, RDPDR_CTYP_CORE);
    Stream_Write_UINT16(output_stream, PAKID_CORE_DEVICE_IOCOMPLETION);

    /* Write content */
    Stream_Write_UINT32(output_stream, device->device_id);
    Stream_Write_UINT32(output_stream, completion_id);
    Stream_Write_UINT32(output_stream, 0); /* Success */
    Stream_Write_UINT32(output_stream, 0); /* fileId */

    svc_plugin_send((rdpSvcPlugin*) device->rdpdr, output_stream);

}

void guac_rdpdr_process_print_job_write(guac_rdpdr_device* device,
        wStream* input_stream, int completion_id) {

    guac_rdpdr_printer_data* printer_data = (guac_rdpdr_printer_data*) device->data;
    int status=0, length;
    unsigned char* buffer;

    wStream* output_stream = Stream_New(NULL, 24);

    Stream_Read_UINT32(input_stream, length);
    Stream_Seek(input_stream, 8);  /* Offset */
    Stream_Seek(input_stream, 20); /* Padding */
    buffer = Stream_Pointer(input_stream);

    /* Create print job, if not yet created */
    if (printer_data->bytes_received == 0) {

        char filename[1024] = "guacamole-print.pdf";
        unsigned char* search = buffer;
        int i;

        /* Search for filename within buffer */
        for (i=0; i<length-9 && i < 2048; i++) {

            /* If title. use as filename */
            if (memcmp(search, "%%Title: ", 9) == 0) {

                /* Skip past "%%Title: " */
                search += 9;

                /* Copy as much of title as reasonable */
                int j;
                for (j=0; j<sizeof(filename) - 5 /* extension + 1 */ && i<length; i++, j++) {

                    /* Get character, stop at EOL */
                    char c = *(search++);
                    if (c == '\r' || c == '\n')
                        break;

                    /* Copy to filename */
                    filename[j] = c;

                }

                /* Append filename with extension */
                strcpy(&(filename[j]), ".pdf");
                break;
            }

            /* Next character */
            search++;

        }

        /* Begin file */
        guac_client_log_info(device->rdpdr->client, "Print job created");
        guac_protocol_send_file(device->rdpdr->client->socket,
                GUAC_RDPDR_PRINTER_BLOB, "application/pdf", filename);

        /* Start print process */
        if (guac_rdpdr_create_print_process(device) != 0) {
            status = 0x80000010;
            length = 0;
        }

    }

    printer_data->bytes_received += length;

    /* If not yet failed, write received data */
    if (status == 0) {

        /* Write data to printer, translate output for RDP */
        length = write(printer_data->printer_input, buffer, length);
        if (length == -1) {
            guac_client_log_error(device->rdpdr->client, "Error writing to printer: %s", strerror(errno));
            status = 0x80000010;
            length = 0;
        }

    }

    /* Write header */
    Stream_Write_UINT16(output_stream, RDPDR_CTYP_CORE);
    Stream_Write_UINT16(output_stream, PAKID_CORE_DEVICE_IOCOMPLETION);

    /* Write content */
    Stream_Write_UINT32(output_stream, device->device_id);
    Stream_Write_UINT32(output_stream, completion_id);
    Stream_Write_UINT32(output_stream, status);
    Stream_Write_UINT32(output_stream, length);
    Stream_Write_UINT8(output_stream, 0); /* padding (stated as optional in spec, but requests fail without) */

    svc_plugin_send((rdpSvcPlugin*) device->rdpdr, output_stream);

}

void guac_rdpdr_process_print_job_close(guac_rdpdr_device* device,
        wStream* input_stream, int completion_id) {

    guac_rdpdr_printer_data* printer_data = (guac_rdpdr_printer_data*) device->data;
    wStream* output_stream = Stream_New(NULL, 24);

    /* Close input and wait for output thread to finish */
    close(printer_data->printer_input);
    pthread_join(printer_data->printer_output_thread, NULL);

    /* Close file descriptors */
    close(printer_data->printer_output);

    /* Close file */
    guac_client_log_info(device->rdpdr->client, "Print job closed");
    guac_protocol_send_end(device->rdpdr->client->socket, GUAC_RDPDR_PRINTER_BLOB);

    /* Write header */
    Stream_Write_UINT16(output_stream, RDPDR_CTYP_CORE);
    Stream_Write_UINT16(output_stream, PAKID_CORE_DEVICE_IOCOMPLETION);

    /* Write content */
    Stream_Write_UINT32(output_stream, device->device_id);
    Stream_Write_UINT32(output_stream, completion_id);
    Stream_Write_UINT32(output_stream, 0); /* NTSTATUS - success */
    Stream_Write_UINT32(output_stream, 0); /* padding*/

    svc_plugin_send((rdpSvcPlugin*) device->rdpdr, output_stream);

}

static void guac_rdpdr_device_printer_announce_handler(guac_rdpdr_device* device,
        wStream* output_stream, int device_id) {

    /* Printer header */
    guac_client_log_info(device->rdpdr->client, "Sending printer");
    Stream_Write_UINT32(output_stream, RDPDR_DTYP_PRINT);
    Stream_Write_UINT32(output_stream, device_id);
    Stream_Write(output_stream, "PRN1\0\0\0\0", 8); /* DOS name */

    /* Printer data */
    Stream_Write_UINT32(output_stream, 24 + GUAC_PRINTER_DRIVER_LENGTH + GUAC_PRINTER_NAME_LENGTH);
    Stream_Write_UINT32(output_stream,
              RDPDR_PRINTER_ANNOUNCE_FLAG_DEFAULTPRINTER
            | RDPDR_PRINTER_ANNOUNCE_FLAG_NETWORKPRINTER);
    Stream_Write_UINT32(output_stream, 0); /* reserved - must be 0 */
    Stream_Write_UINT32(output_stream, 0); /* PnPName length (PnPName is ultimately ignored) */
    Stream_Write_UINT32(output_stream, GUAC_PRINTER_DRIVER_LENGTH); /* DriverName length */
    Stream_Write_UINT32(output_stream, GUAC_PRINTER_NAME_LENGTH);   /* PrinterName length */
    Stream_Write_UINT32(output_stream, 0);                          /* CachedFields length */

    Stream_Write(output_stream, GUAC_PRINTER_DRIVER, GUAC_PRINTER_DRIVER_LENGTH);
    Stream_Write(output_stream, GUAC_PRINTER_NAME,   GUAC_PRINTER_NAME_LENGTH);

}

static void guac_rdpdr_device_printer_iorequest_handler(guac_rdpdr_device* device,
        wStream* input_stream, int file_id, int completion_id, int major_func, int minor_func) {

    switch (major_func) {

        /* Print job create */
        case IRP_MJ_CREATE:
            guac_rdpdr_process_print_job_create(device, input_stream, completion_id);
            break;

        /* Printer job write */
        case IRP_MJ_WRITE:
            guac_rdpdr_process_print_job_write(device, input_stream, completion_id);
            break;

        /* Printer job close */
        case IRP_MJ_CLOSE:
            guac_rdpdr_process_print_job_close(device, input_stream, completion_id);
            break;

        /* Log unknown */
        default:
            guac_client_log_error(device->rdpdr->client,
                    "Unknown printer I/O request function: 0x%x/0x%x",
                    major_func, minor_func);

    }

}

static void guac_rdpdr_device_printer_free_handler(guac_rdpdr_device* device) {
    free(device->data);
}

void guac_rdpdr_register_printer(guac_rdpdrPlugin* rdpdr) {

    int id = rdpdr->devices_registered++;

    /* Get new device */
    guac_rdpdr_device* device = &(rdpdr->devices[id]);

    /* Init device */
    device->rdpdr       = rdpdr;
    device->device_id   = id;
    device->device_name = "Guacamole Printer";

    /* Set handlers */
    device->announce_handler  = guac_rdpdr_device_printer_announce_handler;
    device->iorequest_handler = guac_rdpdr_device_printer_iorequest_handler;
    device->free_handler      = guac_rdpdr_device_printer_free_handler;

    /* Init data */
    device->data = malloc(sizeof(guac_rdpdr_printer_data));

}

