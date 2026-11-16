#include "NexusEqualizerRealtime.h"
#include <stdatomic.h>
#include <stdint.h>
#include <math.h>
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

typedef struct {
    NexusEQBiquadCoefficients target;
    uint32_t remaining;
    float delta_b0, delta_b1, delta_b2, delta_a1, delta_a2;
} CoefficientRamp;

typedef struct {
    float target;
    uint32_t remaining;
    float delta;
} GainRamp;

struct NexusEQRealtime {
    Command queue[QUEUE_CAPACITY];
    _Atomic uint32_t head;
    _Atomic uint32_t tail;
    NexusEQBiquadCoefficients coefficients[NEXUS_EQ_BAND_COUNT];
    CoefficientRamp coefficient_ramps[NEXUS_EQ_BAND_COUNT];
    GainRamp output_gain_ramp;
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
    if (!isfinite(coefficients.b0) || !isfinite(coefficients.b1) ||
        !isfinite(coefficients.b2) || !isfinite(coefficients.a1) ||
        !isfinite(coefficients.a2)) return false;
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
    // Reject negative, non-finite, and unreasonable values before they reach the render thread.
    if (!isfinite(linear_gain) || linear_gain < 0.0f || linear_gain > 64.0f) return false;
    Command command = { .type = COMMAND_OUTPUT_GAIN };
    command.value.output_gain = linear_gain;
    return enqueue(eq, command);
}


bool nexus_eq_realtime_render_set_coefficients(
    NexusEQRealtime *eq, size_t band, NexusEQBiquadCoefficients coefficients) {
    if (!eq || band >= NEXUS_EQ_BAND_COUNT) return false;
    if (!isfinite(coefficients.b0) || !isfinite(coefficients.b1) ||
        !isfinite(coefficients.b2) || !isfinite(coefficients.a1) ||
        !isfinite(coefficients.a2)) return false;
    eq->coefficients[band] = coefficients;
    eq->coefficient_ramps[band].remaining = 0;
    return true;
}

bool nexus_eq_realtime_render_ramp_coefficients(
    NexusEQRealtime *eq, size_t band, NexusEQBiquadCoefficients target, uint32_t duration_frames) {
    if (!eq || band >= NEXUS_EQ_BAND_COUNT || duration_frames == 0) return false;
    if (!isfinite(target.b0) || !isfinite(target.b1) || !isfinite(target.b2) ||
        !isfinite(target.a1) || !isfinite(target.a2)) return false;
    CoefficientRamp *ramp = &eq->coefficient_ramps[band];
    NexusEQBiquadCoefficients current = eq->coefficients[band];
    ramp->target = target;
    ramp->remaining = duration_frames;
    ramp->delta_b0 = (target.b0 - current.b0) / (float)duration_frames;
    ramp->delta_b1 = (target.b1 - current.b1) / (float)duration_frames;
    ramp->delta_b2 = (target.b2 - current.b2) / (float)duration_frames;
    ramp->delta_a1 = (target.a1 - current.a1) / (float)duration_frames;
    ramp->delta_a2 = (target.a2 - current.a2) / (float)duration_frames;
    return true;
}

bool nexus_eq_realtime_render_set_bypass(NexusEQRealtime *eq, bool bypassed) {
    if (!eq) return false;
    eq->bypassed = bypassed;
    return true;
}

bool nexus_eq_realtime_render_set_output_gain(NexusEQRealtime *eq, float linear_gain) {
    if (!eq || !isfinite(linear_gain) || linear_gain < 0.0f || linear_gain > 64.0f) return false;
    eq->output_gain = linear_gain;
    eq->output_gain_ramp.remaining = 0;
    return true;
}

bool nexus_eq_realtime_render_ramp_output_gain(
    NexusEQRealtime *eq, float target_linear_gain, uint32_t duration_frames) {
    if (!eq || !isfinite(target_linear_gain) || target_linear_gain < 0.0f ||
        target_linear_gain > 64.0f || duration_frames == 0) return false;
    eq->output_gain_ramp.target = target_linear_gain;
    eq->output_gain_ramp.remaining = duration_frames;
    eq->output_gain_ramp.delta = (target_linear_gain - eq->output_gain) / (float)duration_frames;
    return true;
}

static inline void advance_ramps(NexusEQRealtime *eq) {
    for (size_t band = 0; band < NEXUS_EQ_BAND_COUNT; ++band) {
        CoefficientRamp *r = &eq->coefficient_ramps[band];
        if (r->remaining == 0) continue;
        NexusEQBiquadCoefficients *c = &eq->coefficients[band];
        c->b0 += r->delta_b0; c->b1 += r->delta_b1; c->b2 += r->delta_b2;
        c->a1 += r->delta_a1; c->a2 += r->delta_a2;
        if (--r->remaining == 0) *c = r->target;
    }
    GainRamp *gain = &eq->output_gain_ramp;
    if (gain->remaining > 0) {
        eq->output_gain += gain->delta;
        if (--gain->remaining == 0) eq->output_gain = gain->target;
    }
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
        const size_t bypass_frames = sample_count / 2u;
        for (size_t frame = 0; frame < bypass_frames; ++frame) {
            advance_ramps(eq);
            samples[frame * 2u] *= eq->output_gain;
            samples[frame * 2u + 1u] *= eq->output_gain;
        }
        return;
    }

    const size_t frames = sample_count / 2u;
    for (size_t frame = 0; frame < frames; ++frame) {
        advance_ramps(eq);
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


void nexus_eq_realtime_render_begin_block(NexusEQRealtime *eq) {
    if (eq) consume_commands(eq);
}

void nexus_eq_realtime_render_planar_segment(
    NexusEQRealtime *eq, float *left, float *right, size_t frame_count) {
    if (!eq || !left) return;
    if (eq->bypassed) {
        for (size_t frame = 0; frame < frame_count; ++frame) {
            advance_ramps(eq);
            left[frame] *= eq->output_gain;
            if (right) right[frame] *= eq->output_gain;
        }
        return;
    }
    for (size_t frame = 0; frame < frame_count; ++frame) {
        advance_ramps(eq);
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
