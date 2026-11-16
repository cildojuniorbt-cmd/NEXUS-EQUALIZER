package com.nexus.equalizer

import android.app.Activity
import android.os.Bundle
import android.view.Gravity
import android.widget.LinearLayout
import android.widget.HorizontalScrollView
import android.widget.SeekBar
import android.widget.Switch
import android.widget.ScrollView
import android.widget.TextView
import java.util.Locale

class MainActivity : Activity() {
    private val equalizer = SystemEqualizerController()
    private val preferences by lazy { getSharedPreferences("nexus-eq", MODE_PRIVATE) }
    private lateinit var statusText: TextView
    private lateinit var bandsContainer: LinearLayout
    private lateinit var presetsContainer: LinearLayout
    private lateinit var enableSwitch: Switch

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        buildUi()
    }

    override fun onResume() {
        super.onResume()
        if (::statusText.isInitialized) refreshEffect()
    }

    private fun buildUi() {
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(28, 36, 28, 24)
            setBackgroundColor(0xFF11151B.toInt())
        }
        root.addView(TextView(this).apply {
            text = "NEXUS EQUALIZER"
            textSize = 24f
            setTextColor(0xFFFFFFFF.toInt())
        })
        statusText = TextView(this).apply {
            textSize = 14f
            setTextColor(0xFFB7C4D3.toInt())
            setPadding(0, 18, 0, 18)
        }
        enableSwitch = Switch(this).apply {
            text = "Equalizador"
            setTextColor(0xFFFFFFFF.toInt())
            isEnabled = false
            setOnCheckedChangeListener { _, checked ->
                val applied = equalizer.setEnabled(checked)
                if (!applied) {
                    isChecked = false
                    statusText.text = "O Android não permitiu ativar o efeito neste momento."
                } else {
                    preferences.edit().putBoolean("enabled", checked).apply()
                }
            }
        }
        val refresh = TextView(this).apply {
            text = "VERIFICAR COMPATIBILIDADE"
            textSize = 13f
            gravity = Gravity.CENTER
            setTextColor(0xFF11151B.toInt())
            setBackgroundColor(0xFF5DE1E6.toInt())
            setPadding(18, 16, 18, 16)
            setOnClickListener { refreshEffect() }
        }
        presetsContainer = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }
        bandsContainer = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        root.addView(statusText)
        root.addView(enableSwitch)
        root.addView(refresh)
        root.addView(TextView(this).apply {
            text = "PRESETS"
            textSize = 12f
            setTextColor(0xFF5DE1E6.toInt())
            setPadding(0, 22, 0, 8)
        })
        root.addView(HorizontalScrollView(this).apply {
            isHorizontalScrollBarEnabled = false
            addView(presetsContainer)
        })
        root.addView(bandsContainer)
        setContentView(ScrollView(this).apply {
            isFillViewport = true
            addView(root)
        })
    }

    private fun refreshEffect() {
        val status = equalizer.connect()
        statusText.text = status.message
        bandsContainer.removeAllViews()
        presetsContainer.removeAllViews()
        val available = status.state == SystemEqualizerController.State.AVAILABLE_AND_CONTROLLED
        val savedPreset = preferences.getString("preset", null)
            ?.let { name -> EqPreset.values().firstOrNull { it.name == name } }
        if (available && savedPreset != null) {
            for (index in 0 until status.bandCount) {
                val frequency = equalizer.centerFrequencyHz(index) ?: continue
                val gainMb = (EqPreset.gainAt(savedPreset, frequency.toDouble()) * 100.0).toInt()
                equalizer.setBandLevel(index, gainMb)
            }
        } else if (available && preferences.getString("preset", null) == "CUSTOM") {
            for (index in 0 until status.bandCount) {
                val savedLevel = preferences.getInt("band_level_$index", 0)
                equalizer.setBandLevel(index, savedLevel)
            }
        }
        enableSwitch.setOnCheckedChangeListener(null)
        enableSwitch.isEnabled = available
        enableSwitch.isChecked = available && preferences.getBoolean("enabled", status.enabled)
        if (available) {
            equalizer.setEnabled(enableSwitch.isChecked)
            enableSwitch.setOnCheckedChangeListener { _, checked ->
                val applied = equalizer.setEnabled(checked)
                if (!applied) {
                    enableSwitch.isChecked = false
                    statusText.text = "O controle do efeito foi perdido ou não está disponível."
                } else preferences.edit().putBoolean("enabled", checked).apply()
            }
        } else {
            val note = TextView(this).apply {
                text = "Este aparelho não disponibilizou controle do efeito de saída. Não é possível forçar outros aplicativos a usar este equalizador."
                setTextColor(0xFFFFC078.toInt())
                textSize = 14f
                setPadding(0, 24, 0, 0)
            }
            bandsContainer.addView(note)
            return
        }

        EqPreset.values().forEach { preset ->
            val chip = TextView(this).apply {
                text = preset.title
                textSize = 13f
                setTextColor(0xFF11151B.toInt())
                val selected = preferences.getString("preset", null) == preset.name
                setBackgroundColor(if (selected) 0xFF5DE1E6.toInt() else 0xFF27313D.toInt())
                setPadding(18, 12, 18, 12)
                setOnClickListener { applyPreset(preset, status.bandCount) }
            }
            val params = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply { marginEnd = 10 }
            presetsContainer.addView(chip, params)
        }

        for (index in 0 until status.bandCount) {
            val frequency = equalizer.centerFrequencyHz(index)
            val label = TextView(this).apply {
                text = frequency?.let { formatFrequency(it) } ?: "Banda ${index + 1}"
                setTextColor(0xFFFFFFFF.toInt())
                setPadding(0, 12, 0, 0)
            }
            val slider = SeekBar(this).apply {
                max = status.maxLevelMb - status.minLevelMb
                progress = (equalizer.bandLevel(index) ?: 0) - status.minLevelMb
                setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
                    override fun onProgressChanged(seekBar: SeekBar?, progress: Int, fromUser: Boolean) {
                        if (fromUser) {
                            val level = progress + status.minLevelMb
                            preferences.edit()
                                .putString("preset", "CUSTOM")
                                .putInt("band_level_$index", level)
                                .apply()
                            if (!equalizer.setBandLevel(index, level)) {
                                statusText.text = "Não foi possível alterar a banda. O controle pode ter sido transferido."
                            }
                        }
                    }
                    override fun onStartTrackingTouch(seekBar: SeekBar?) = Unit
                    override fun onStopTrackingTouch(seekBar: SeekBar?) = Unit
                })
            }
            bandsContainer.addView(label)
            bandsContainer.addView(slider)
        }
    }


    private fun applyPreset(preset: EqPreset, bandCount: Int) {
        var allApplied = true
        for (index in 0 until bandCount) {
            val frequency = equalizer.centerFrequencyHz(index)
            if (frequency == null) {
                allApplied = false
                continue
            }
            val gainMb = (EqPreset.gainAt(preset, frequency.toDouble()) * 100.0).toInt()
            if (!equalizer.setBandLevel(index, gainMb)) allApplied = false
        }
        if (allApplied) {
            val editor = preferences.edit().putString("preset", preset.name)
            for (index in 0 until bandCount) {
                val frequency = equalizer.centerFrequencyHz(index) ?: continue
                val gainMb = (EqPreset.gainAt(preset, frequency.toDouble()) * 100.0).toInt()
                editor.putInt("band_level_$index", gainMb)
            }
            editor.apply()
            statusText.text = "Preset ${preset.title} aplicado às bandas disponíveis do aparelho."
        } else {
            statusText.text = "Não foi possível aplicar todas as bandas. O controle pode ter sido perdido."
        }
    }

    private fun formatFrequency(hz: Int): String = when {
        hz >= 1000 -> String.format(Locale.getDefault(), "%.1f kHz", hz / 1000.0)
        else -> "${hz} Hz"
    }

    override fun onDestroy() {
        equalizer.release()
        super.onDestroy()
    }
}
