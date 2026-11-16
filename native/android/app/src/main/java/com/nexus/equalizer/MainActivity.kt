package com.nexus.equalizer

import android.app.Activity
import android.os.Bundle
import android.view.Gravity
import android.widget.LinearLayout
import android.widget.SeekBar
import android.widget.TextView

class MainActivity : Activity() {
    private val equalizer = SystemEqualizerController()
    private lateinit var statusText: TextView
    private lateinit var bandsContainer: LinearLayout
    private var bandCount = 0
    private var minLevel = 0
    private var maxLevel = 0

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
        val title = TextView(this).apply {
            text = "NEXUS EQUALIZER"
            textSize = 24f
            setTextColor(0xFFFFFFFF.toInt())
        }
        statusText = TextView(this).apply {
            textSize = 14f
            setTextColor(0xFFB7C4D3.toInt())
            setPadding(0, 18, 0, 18)
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
        root.addView(title)
        root.addView(statusText)
        root.addView(refresh)
        root.addView(bandsContainer)
        setContentView(root)
    }

    private fun refreshEffect() {
        val status = equalizer.connect()
        statusText.text = status.message
        bandCount = status.bandCount
        minLevel = status.minLevelMb
        maxLevel = status.maxLevelMb
        bandsContainer.removeAllViews()
        if (status.state != SystemEqualizerController.State.AVAILABLE_AND_CONTROLLED) {
            val note = TextView(this).apply {
                text = "Este app não consegue forçar o áudio de outros aplicativos a passar pelo equalizador. A compatibilidade depende do Android e do fabricante."
                setTextColor(0xFFFFC078.toInt())
                textSize = 14f
                setPadding(0, 24, 0, 0)
            }
            bandsContainer.addView(note)
            return
        }
        for (index in 0 until bandCount) {
            val label = TextView(this).apply {
                text = "Banda ${index + 1}"
                setTextColor(0xFFFFFFFF.toInt())
            }
            val slider = SeekBar(this).apply {
                max = maxLevel - minLevel
                progress = -minLevel
                setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
                    override fun onProgressChanged(seekBar: SeekBar?, progress: Int, fromUser: Boolean) {
                        if (fromUser) equalizer.setBandLevel(index, progress + minLevel)
                    }
                    override fun onStartTrackingTouch(seekBar: SeekBar?) = Unit
                    override fun onStopTrackingTouch(seekBar: SeekBar?) = Unit
                })
            }
            bandsContainer.addView(label)
            bandsContainer.addView(slider)
        }
    }

    override fun onDestroy() {
        equalizer.release()
        super.onDestroy()
    }
}
