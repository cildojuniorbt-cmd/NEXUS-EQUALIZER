package com.nexus.equalizer

import android.app.Activity
import android.os.Bundle
import android.view.Gravity
import android.widget.LinearLayout
import android.widget.SeekBar
import android.widget.Switch
import android.widget.TextView
import java.util.Locale

class MainActivity : Activity() {
    private val equalizer = SystemEqualizerController()
    private val preferences by lazy { getSharedPreferences("nexus-eq", MODE_PRIVATE) }
    private lateinit var statusText: TextView
    private lateinit var bandsContainer: LinearLayout
    private lateinit var enableSwitch: Switch

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        buildUi()
        refreshEffect()
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
        bandsContainer = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        root.addView(statusText)
        root.addView(enableSwitch)
        root.addView(refresh)
        root.addView(bandsContainer)
        setContentView(root)
    }

    private fun refreshEffect() {
        val status = equalizer.connect()
        statusText.text = status.message
        bandsContainer.removeAllViews()
        val available = status.state == SystemEqualizerController.State.AVAILABLE_AND_CONTROLLED
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
                        if (fromUser && !equalizer.setBandLevel(index, progress + status.minLevelMb)) {
                            statusText.text = "Não foi possível alterar a banda. O controle pode ter sido transferido."
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

    private fun formatFrequency(hz: Int): String = when {
        hz >= 1000 -> String.format(Locale.getDefault(), "%.1f kHz", hz / 1000.0)
        else -> "${hz} Hz"
    }

    override fun onDestroy() {
        equalizer.release()
        super.onDestroy()
    }
}
