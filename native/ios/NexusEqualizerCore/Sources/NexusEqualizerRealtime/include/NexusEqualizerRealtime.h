#ifndef NEXUS_EQUALIZER_REALTIME_H
#define NEXUS_EQUALIZER_REALTIME_H

#include <stdbool.h>
#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

#define NEXUS_EQ_BAND_COUNT 10

typedef struct NexusEQRealtime NexusEQRealtime;

typedef struct {
    float b0, b1, b2, a1, a2;
} NexusEQBiquadCoefficients;

/* Create/destroy on a control thread, never from an audio callback. */
NexusEQRealtime *nexus_eq_realtime_create(void);
void nexus_eq_realtime_destroy(NexusEQRealtime *eq);

/*
 * Single-producer/single-consumer contract:
 * control APIs are called from one serialized control thread;
 * render is called from one audio thread.
 * Returns false when the bounded queue is full.
 */
bool nexus_eq_realtime_set_coefficients(
    NexusEQRealtime *eq, size_t band, NexusEQBiquadCoefficients coefficients);
bool nexus_eq_realtime_set_bypass(NexusEQRealtime *eq, bool bypassed);
bool nexus_eq_realtime_set_output_gain(NexusEQRealtime *eq, float linear_gain);

/* In-place interleaved stereo render. No locks, allocations, or system calls. */
void nexus_eq_realtime_render(NexusEQRealtime *eq, float *interleaved, size_t sample_count);
/* Planar float render for AUv3 non-interleaved buffers. right may be NULL for mono. */
void nexus_eq_realtime_render_planar(NexusEQRealtime *eq, float *left, float *right, size_t frame_count);

#ifdef __cplusplus
}
#endif
#endif
