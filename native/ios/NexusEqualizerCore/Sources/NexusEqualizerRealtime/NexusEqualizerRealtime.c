#include "NexusEqualizerRealtime.h"
#include <stdatomic.h>
#include <stdint.h>
#include <stdlib.h>

#define QUEUE_CAPACITY 256u

typedef enum { COMMAND_COEFFICIENTS, COMMAND_BYPASS, COMMAND_OUTPUT_GAIN } CommandType;
typedef struct {
    CommandType type;
    uint32_t band;
    union {
        NexusEQBiquadCoefficients coefficients;
        int bypassed;
        float output_gain;
    } value;
} Command;

typedef struct {
    float x1, x2, y1, y2;
} BiquadState;

struct NexusEQRealtime {
    Command queue[QUEUE_CAPACITY];
    _Atomic uint32_t head;
    _Atomic uint32_t tail;
    NexusEQBiquadCoefficients coefficients[NEXUS_EQ_BAND_COUNT];
    BiquadState left[NEXUS_EQ_BAND_COUNT];
    BiquadState right[NEXUS_EQ_BAND_COUNT];
    bool bypassed;
    float output_gain;
};

static bool enqueue(NexusEQRealtime *eq, Command command) {
    if (!eq) return false;
    const uint32_t head = atomic_load_explicit(&eq->head, memory_order_relaxed);
    const uint32_t next = (head + 1u) % QUEUE_CAPACITY;
    const uint32_t tail = atomic_load_explicit(&eq->tail, memory_order_acquire);
    if (next == tail) return false;
    eq->queue[head] = command;
    atomic_store_explicit(&eq->head, next, memory_order_release);
    return true;
}

NexusEQRealtime *nexus_eq_realtime_create(void) {
    NexusEQRealtime *eq = (NexusEQRealtime *)calloc(1, sizeof(NexusEQRealtime));
    if (!eq) return NULL;
    atomic_init(&eq->head, 0u);
    atomic_init(&eq->tail, 0u);
    eq->output_gain = 1.0f;
    for (size_t i = 0; i < NEXUS_EQ_BAND_COUNT; ++i) {
        eq->coefficients[i].b0 = 1.0f;
    }
    return eq;
}

void nexus_eq_realtime_destroy(NexusEQRealtime *eq) { free(eq); }

bool nexus_eq_realtime_set_coefficients(
    NexusEQRealtime *eq, size_t band, NexusEQBiquadCoefficients coefficients) {
    if (band >= NEXUS_EQ_BAND_COUNT) return false;
    Command command = { .type = COMMAND_COEFFICIENTS, .band = (uint32_t)band };
    command.value.coefficients = coefficients;
    return enqueue(eq, command);
}

bool nexus_eq_realtime_set_bypass(NexusEQRealtime *eq, bool bypassed) {
    Command command = { .type = COMMAND_BYPASS };
    command.value.bypassed = bypassed ? 1 : 0;
    return enqueue(eq, command);
}

bool nexus_eq_realtime_set_output_gain(NexusEQRealtime *eq, float linear_gain) {
    if (linear_gain < 0.0f) linear_gain = 0.0f;
    Command command = { .type = COMMAND_OUTPUT_GAIN };
    command.value.output_gain = linear_gain;
    return enqueue(eq, command);
}

static inline float process_one(float input, const NexusEQBiquadCoefficients *c, BiquadState *s) {
    const float output = c->b0 * input + c->b1 * s->x1 + c->b2 * s->x2
        - c->a1 * s->y1 - c->a2 * s->y2;
    s->x2 = s->x1; s->x1 = input; s->y2 = s->y1; s->y1 = output;
    return output;
}


static void consume_commands(NexusEQRealtime *eq) {
    uint32_t tail = atomic_load_explicit(&eq->tail, memory_order_relaxed);
    const uint32_t head = atomic_load_explicit(&eq->head, memory_order_acquire);
    while (tail != head) {
        const Command command = eq->queue[tail];
        switch (command.type) {
            case COMMAND_COEFFICIENTS:
                if (command.band < NEXUS_EQ_BAND_COUNT)
                    eq->coefficients[command.band] = command.value.coefficients;
                break;
            case COMMAND_BYPASS: eq->bypassed = command.value.bypassed != 0; break;
            case COMMAND_OUTPUT_GAIN: eq->output_gain = command.value.output_gain; break;
        }
        tail = (tail + 1u) % QUEUE_CAPACITY;
    }
    atomic_store_explicit(&eq->tail, tail, memory_order_release);
}

void nexus_eq_realtime_render(NexusEQRealtime *eq, float *samples, size_t sample_count) {
    if (!eq || !samples) return;

    consume_commands(eq);

    if (eq->bypassed) {
        if (eq->output_gain != 1.0f)
            for (size_t i = 0; i < sample_count; ++i) samples[i] *= eq->output_gain;
        return;
    }

    const size_t frames = sample_count / 2u;
    for (size_t frame = 0; frame < frames; ++frame) {
        float left = samples[frame * 2u];
        float right = samples[frame * 2u + 1u];
        for (size_t band = 0; band < NEXUS_EQ_BAND_COUNT; ++band) {
            left = process_one(left, &eq->coefficients[band], &eq->left[band]);
            right = process_one(right, &eq->coefficients[band], &eq->right[band]);
        }
        samples[frame * 2u] = left * eq->output_gain;
        samples[frame * 2u + 1u] = right * eq->output_gain;
    }
}


void nexus_eq_realtime_render_planar(
    NexusEQRealtime *eq, float *left, float *right, size_t frame_count) {
    if (!eq || !left) return;
    consume_commands(eq);
    if (eq->bypassed) {
        if (eq->output_gain != 1.0f) {
            for (size_t frame = 0; frame < frame_count; ++frame) {
                left[frame] *= eq->output_gain;
                if (right) right[frame] *= eq->output_gain;
            }
        }
        return;
    }
    for (size_t frame = 0; frame < frame_count; ++frame) {
        float l = left[frame];
        float r = right ? right[frame] : 0.0f;
        for (size_t band = 0; band < NEXUS_EQ_BAND_COUNT; ++band) {
            l = process_one(l, &eq->coefficients[band], &eq->left[band]);
            if (right) r = process_one(r, &eq->coefficients[band], &eq->right[band]);
        }
        left[frame] = l * eq->output_gain;
        if (right) right[frame] = r * eq->output_gain;
    }
}
