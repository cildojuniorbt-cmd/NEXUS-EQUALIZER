package com.nexus.equalizer

import android.app.Activity
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.view.WindowInsets
import android.widget.HorizontalScrollView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.SeekBar
import android.widget.Switch
import android.widget.TextView
import android.content.res.ColorStateList
import java.util.Locale
import kotlin.math.max
import kotlin.math.min

class MainActivity : Activity() {
    private val equalizer = SystemEqualizerController()
    private val bassEngine = SystemBassBoostController()
    private lateinit var bassStatusText: TextView
    private lateinit var bassSwitch: Switch
    private lateinit var bassStrength: SeekBar
    private lateinit var bassValue: TextView
    private val preferences by lazy { getSharedPreferences("nexus-eq", MODE_PRIVATE) }
    private lateinit var statusText: TextView
    private lateinit var bandsContainer: LinearLayout
    private lateinit var presetsContainer: LinearLayout
    private lateinit var enableSwitch: Switch
    private lateinit var curveView: EqCurveView
    private lateinit var pageContainer: LinearLayout
    private lateinit var eqPage: LinearLayout
    private val navigationItems = mutableListOf<TextView>()
    private var selectedModule = 0
    private val bandSliders = mutableListOf<SeekBar>()
    private val bandValues = mutableListOf<TextView>()
    private val presetChips = mutableListOf<TextView>()
    private var currentStatus: SystemEqualizerController.Status? = null

    private val bg = 0xFF090D12.toInt()
    private val panel = 0xFF111923.toInt()
    private val panelRaised = 0xFF172330.toInt()
    private val cyan = 0xFF59E1E8.toInt()
    private val white = 0xFFF3F7FA.toInt()
    private val muted = 0xFF91A2B3.toInt()
    private val green = 0xFF72E0B0.toInt()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.statusBarColor = bg
        window.navigationBarColor = bg
        if (Build.VERSION.SDK_INT >= 29) {
            window.isNavigationBarContrastEnforced = false
            window.isStatusBarContrastEnforced = false
        }
        buildUi()
    }

    override fun onResume() {
        super.onResume()
        if (::statusText.isInitialized) { refreshEffect(); refreshBassEngine() }
    }

    private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()

    private fun rounded(color: Int, radius: Int = 18, stroke: Int? = null): GradientDrawable =
        GradientDrawable().apply {
            setColor(color)
            cornerRadius = dp(radius).toFloat()
            if (stroke != null) setStroke(dp(1), stroke)
        }

    private fun text(value: String, size: Float, color: Int, bold: Boolean = false): TextView =
        TextView(this).apply {
            text = value
            textSize = size
            setTextColor(color)
            if (bold) typeface = Typeface.create("sans-serif-medium", Typeface.NORMAL)
            includeFontPadding = false
        }

    private fun card(): LinearLayout = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        setPadding(dp(18), dp(18), dp(18), dp(18))
        background = rounded(panel, 20, 0xFF1E2A36.toInt())
    }

    private fun buildUi() {
        val scroll = ScrollView(this).apply {
            isFillViewport = true
            clipToPadding = false
            setBackgroundColor(bg)
        }
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(20), dp(18), dp(20), dp(28))
            setBackgroundColor(bg)
        }
        // Android 15 enforces edge-to-edge for target SDK 35. Apply system bar insets
        // explicitly so the title and controls never sit underneath the status bar.
        root.setOnApplyWindowInsetsListener { view, insets ->
            val top = if (Build.VERSION.SDK_INT >= 30) insets.getInsets(WindowInsets.Type.statusBars()).top else insets.systemWindowInsetTop
            val bottom = if (Build.VERSION.SDK_INT >= 30) insets.getInsets(WindowInsets.Type.navigationBars()).bottom else insets.systemWindowInsetBottom
            view.setPadding(dp(20), dp(18) + top, dp(20), dp(28) + bottom)
            insets
        }
        scroll.addView(root)

        val brandRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }
        val brand = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        brand.addView(text("NEXUS", 13f, cyan, true))
        brand.addView(text("EQUALIZER", 25f, white, true).apply { setPadding(0, dp(2), 0, 0) })
        brandRow.addView(brand, LinearLayout.LayoutParams(0, -2, 1f))
        brandRow.addView(text("ANDROID  /  AUDIO", 10f, muted, true))
        root.addView(brandRow)
        root.addView(text("Seu som. Seu ajuste.", 14f, muted).apply {
            setPadding(0, dp(7), 0, dp(18))
        })

        val navigation = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(0, dp(4), 0, dp(16))
        }
        val moduleNames = listOf("EQ", "DSP", "ROOM", "HEAD", "ANALYZE")
        moduleNames.forEachIndexed { index, label ->
            val item = text(label, 10f, if (index == 0) bg else muted, true).apply {
                gravity = Gravity.CENTER
                setPadding(dp(12), dp(12), dp(12), dp(12))
                background = rounded(if (index == 0) cyan else panelRaised, 12)
                setOnClickListener { showModule(index) }
            }
            navigationItems.add(item)
            navigation.addView(item, LinearLayout.LayoutParams(0, dp(42), 1f).apply {
                marginEnd = if (index == moduleNames.lastIndex) 0 else dp(5)
            })
        }
        root.addView(navigation)
        pageContainer = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        eqPage = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }

        val statusCard = card().apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(16), dp(14), dp(16), dp(14))
        }
        val statusDot = View(this).apply {
            background = rounded(green, 20)
        }
        statusCard.addView(statusDot, LinearLayout.LayoutParams(dp(8), dp(8)).apply { marginEnd = dp(12) })
        statusText = text("Verificando áudio do aparelho…", 12f, muted)
        statusCard.addView(statusText, LinearLayout.LayoutParams(0, -2, 1f))
        eqPage.addView(statusCard)

        val powerRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(0, dp(17), 0, dp(16))
        }
        val powerLabels = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        powerLabels.addView(text("EQUALIZADOR", 12f, muted, true))
        powerLabels.addView(text("Processamento de saída", 15f, white, true).apply { setPadding(0, dp(4), 0, 0) })
        powerRow.addView(powerLabels, LinearLayout.LayoutParams(0, -2, 1f))
        enableSwitch = Switch(this).apply {
            text = ""
            isEnabled = false
            thumbTintList = ColorStateList.valueOf(white)
            trackTintList = ColorStateList.valueOf(cyan)
        }
        powerRow.addView(enableSwitch)
        eqPage.addView(powerRow)

        val eqCard = card()
        val eqHeader = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }
        eqHeader.addView(text("CURVA DE EQUALIZAÇÃO", 12f, white, true), LinearLayout.LayoutParams(0, -2, 1f))
        eqHeader.addView(text("5 BANDAS", 10f, cyan, true))
        eqCard.addView(eqHeader)
        curveView = EqCurveView(this).apply {
            setPadding(0, dp(8), 0, dp(4))
        }
        eqCard.addView(curveView, LinearLayout.LayoutParams(-1, dp(112)))
        eqPage.addView(eqCard)

        eqPage.addView(text("PRESETS", 11f, muted, true).apply {
            setPadding(dp(2), dp(23), 0, dp(11))
        })
        presetsContainer = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }
        eqPage.addView(HorizontalScrollView(this).apply {
            isHorizontalScrollBarEnabled = false
            clipToPadding = false
            addView(presetsContainer)
        })

        val bandsCard = card().apply { setPadding(dp(18), dp(18), dp(18), dp(10)) }
        val bandsHeader = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }
        bandsHeader.addView(text("AJUSTE FINO", 12f, white, true), LinearLayout.LayoutParams(0, -2, 1f))
        bandsHeader.addView(text("−12 dB    0    +12 dB", 10f, muted))
        bandsCard.addView(bandsHeader)
        bandsContainer = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        bandsCard.addView(bandsContainer)
        eqPage.addView(bandsCard, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(16) })

        eqPage.addView(text("NEXUS  •  SOUND YOUR WAY", 10f, 0xFF526273.toInt(), true).apply {
            gravity = Gravity.CENTER
            setPadding(0, dp(24), 0, dp(4))
        })
        pageContainer.addView(eqPage)
        root.addView(pageContainer)
        setContentView(scroll)
        refreshEffect()
    }


    private fun showModule(index: Int) {
        selectedModule = index
        navigationItems.forEachIndexed { itemIndex, item ->
            val active = itemIndex == index
            item.background = rounded(if (active) cyan else panelRaised, 12)
            item.setTextColor(if (active) bg else muted)
        }
        pageContainer.removeAllViews()
        if (index == 0) {
            pageContainer.addView(eqPage)
            return
        }
        if (index == 1) {
            pageContainer.addView(buildDspPage())
            refreshBassEngine()
            return
        }
        val titles = listOf("", "DSP STUDIO", "ROOM STUDIO", "HEADPHONE STUDIO", "AUDIO ANALYZER")
        val subtitles = listOf("", "Processamento e efeitos", "Ambientes e correção acústica", "Perfis e calibração de fones", "Medição e monitoramento")
        val descriptions = listOf(
            emptyList(),
            listOf("BASS ENGINE" to "Graves, punch e impacto", "EXCITER" to "Brilho e presença", "STEREO ENHANCER" to "Largura estéreo", "CROSSFEED" to "Escuta em fones", "DYNAMICS" to "Compressor, limiter e de-esser", "DSP CHAIN" to "Ordem dos processadores"),
            listOf("ROOM PROFILE" to "Perfis para diferentes ambientes", "SPEAKER SETUP" to "Configuração e posicionamento", "ACOUSTIC CORRECTION" to "Correção baseada em medições reais", "DISTANCE" to "Distância e parâmetros das caixas"),
            listOf("HEADPHONE PROFILES" to "Perfis por modelo de fone", "FREQUENCY COMPENSATION" to "Compensação de frequência", "DEVICE PROFILES" to "Ajustes por dispositivo", "SPATIAL AUDIO" to "Palco e espacialidade, quando suportados"),
            listOf("FFT SPECTRUM" to "Analisador de frequência em tempo real", "PEAK / RMS" to "Medidores de nível", "CLIPPING" to "Indicador de saturação", "SIGNAL MONITOR" to "Monitoramento de entrada e saída")
        )
        val page = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(0, dp(8), 0, dp(24))
        }
        page.addView(text("NEXUS / MODULE 0$index", 10f, cyan, true))
        page.addView(text(titles[index], 24f, white, true).apply { setPadding(0, dp(6), 0, dp(5)) })
        page.addView(text(subtitles[index], 13f, muted).apply { setPadding(0, 0, 0, dp(18)) })
        val notice = card().apply {
            setPadding(dp(16), dp(14), dp(16), dp(14))
            addView(text("MÓDULO EM DESENVOLVIMENTO", 11f, cyan, true))
            addView(text("A estrutura está sendo preparada. Os controles serão habilitados somente quando o processamento real estiver integrado e validado neste aparelho.", 12f, muted).apply { setPadding(0, dp(7), 0, 0) })
        }
        page.addView(notice, LinearLayout.LayoutParams(-1, -2).apply { bottomMargin = dp(18) })
        descriptions[index].forEach { (title, detail) ->
            val item = card().apply {
                setPadding(dp(16), dp(15), dp(16), dp(15))
                addView(text(title, 13f, white, true))
                addView(text(detail, 11f, muted).apply { setPadding(0, dp(5), 0, 0) })
            }
            page.addView(item, LinearLayout.LayoutParams(-1, -2).apply { bottomMargin = dp(10) })
        }
        pageContainer.addView(page)
    }

    private fun refreshEffect() {
        val status = equalizer.connect()
        currentStatus = status
        statusText.text = status.message
        bandsContainer.removeAllViews()
        presetsContainer.removeAllViews()
        bandSliders.clear()
        bandValues.clear()
        presetChips.clear()
        val available = status.state == SystemEqualizerController.State.AVAILABLE_AND_CONTROLLED
        val savedName = preferences.getString("preset", null)
        val savedPreset = savedName?.let { name -> EqPreset.values().firstOrNull { it.name == name } }
        if (available && savedPreset != null) {
            for (index in 0 until status.bandCount) {
                val frequency = equalizer.centerFrequencyHz(index) ?: continue
                val gainMb = (EqPreset.gainAt(savedPreset, frequency.toDouble()) * 100.0).toInt()
                equalizer.setBandLevel(index, gainMb)
            }
        } else if (available && savedName == "CUSTOM") {
            for (index in 0 until status.bandCount) {
                equalizer.setBandLevel(index, preferences.getInt("band_level_$index", 0))
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
                    enableSwitch.setOnCheckedChangeListener(null)
                    enableSwitch.isChecked = false
                    enableSwitch.setOnCheckedChangeListener { _, value -> toggleEffect(value) }
                    statusText.text = "Não foi possível alterar o estado do efeito."
                } else preferences.edit().putBoolean("enabled", checked).apply()
            }
        }

        if (!available) {
            bandsContainer.addView(text(
                "Este aparelho não disponibilizou o controle do efeito de saída. Não é possível forçar outros aplicativos a usar este equalizador.",
                13f, 0xFFFFC078.toInt()
            ).apply { setPadding(0, dp(18), 0, dp(18)) })
            curveView.setGains(emptyList())
            return
        }

        EqPreset.values().forEach { preset ->
            val selected = savedName == preset.name
            val chip = text(preset.title, 12f, if (selected) bg else white, true).apply {
                gravity = Gravity.CENTER
                setPadding(dp(16), dp(12), dp(16), dp(12))
                background = rounded(if (selected) cyan else panelRaised, 14,
                    if (selected) cyan else 0xFF2A3947.toInt())
                setOnClickListener { applyPreset(preset, status) }
            }
            presetChips.add(chip)
            presetsContainer.addView(chip, LinearLayout.LayoutParams(-2, -2).apply { marginEnd = dp(8) })
        }

        val gains = mutableListOf<Float>()
        for (index in 0 until status.bandCount) {
            val frequency = equalizer.centerFrequencyHz(index)
            val level = equalizer.bandLevel(index) ?: 0
            gains.add(level / 100f)
            val row = LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                setPadding(0, dp(13), 0, dp(5))
            }
            val labelRow = LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
            }
            labelRow.addView(text(frequency?.let { formatFrequency(it) } ?: "Banda ${index + 1}", 14f, white, true),
                LinearLayout.LayoutParams(0, -2, 1f))
            val valueLabel = text(String.format(Locale.getDefault(), "%+.1f dB", level / 100f), 12f, cyan, true)
            labelRow.addView(valueLabel)
            row.addView(labelRow)
            val slider = SeekBar(this).apply {
                max = status.maxLevelMb - status.minLevelMb
                progress = (level - status.minLevelMb).coerceIn(0, max)
                progressTintList = ColorStateList.valueOf(cyan)
                thumbTintList = ColorStateList.valueOf(cyan)
                progressBackgroundTintList = ColorStateList.valueOf(0xFF34414D.toInt())
                setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
                    override fun onProgressChanged(seekBar: SeekBar?, progress: Int, fromUser: Boolean) {
                        if (!fromUser) return
                        val newLevel = progress + status.minLevelMb
                        valueLabel.text = String.format(Locale.getDefault(), "%+.1f dB", newLevel / 100f)
                        preferences.edit().putString("preset", "CUSTOM")
                            .putInt("band_level_$index", newLevel).apply()
                        updatePresetChipStyles(null)
                        if (!equalizer.setBandLevel(index, newLevel)) {
                            statusText.text = "O controle do efeito foi perdido. Verifique a compatibilidade."
                        }
                        updateCurveFromControls()
                    }
                    override fun onStartTrackingTouch(seekBar: SeekBar?) = Unit
                    override fun onStopTrackingTouch(seekBar: SeekBar?) = Unit
                })
            }
            row.addView(slider)
            bandsContainer.addView(row)
            bandSliders.add(slider)
            bandValues.add(valueLabel)
        }
        curveView.setGains(gains)
    }


    private fun buildDspPage(): LinearLayout {
        val page = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(0, dp(8), 0, dp(24)) }
        page.addView(text("NEXUS / DSP ENGINE", 10f, cyan, true))
        page.addView(text("DSP STUDIO", 24f, white, true).apply { setPadding(0, dp(6), 0, dp(5)) })
        page.addView(text("Processamento de graves na saída de áudio", 13f, muted).apply { setPadding(0, 0, 0, dp(18)) })
        val statusCard = card()
        statusCard.addView(text("BASS ENGINE", 13f, white, true))
        bassStatusText = text("Verificando disponibilidade…", 12f, muted).apply { setPadding(0, dp(7), 0, 0) }
        statusCard.addView(bassStatusText)
        page.addView(statusCard, LinearLayout.LayoutParams(-1, -2).apply { bottomMargin = dp(14) })
        val controlCard = card()
        val header = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
        val labels = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        labels.addView(text("BASS BOOST", 13f, white, true))
        labels.addView(text("Reforço de baixas frequências", 11f, muted).apply { setPadding(0, dp(4), 0, 0) })
        header.addView(labels, LinearLayout.LayoutParams(0, -2, 1f))
        bassSwitch = Switch(this).apply { text = ""; thumbTintList = ColorStateList.valueOf(white); trackTintList = ColorStateList.valueOf(cyan) }
        header.addView(bassSwitch); controlCard.addView(header)
        val strengthHeader = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL; setPadding(0, dp(20), 0, dp(5)) }
        strengthHeader.addView(text("INTENSIDADE", 11f, muted, true), LinearLayout.LayoutParams(0, -2, 1f))
        bassValue = text("0%", 12f, cyan, true); strengthHeader.addView(bassValue); controlCard.addView(strengthHeader)
        bassStrength = SeekBar(this).apply { max = 1000; progress = 0; progressTintList = ColorStateList.valueOf(cyan); thumbTintList = ColorStateList.valueOf(cyan); progressBackgroundTintList = ColorStateList.valueOf(0xFF34414D.toInt()) }
        controlCard.addView(bassStrength); page.addView(controlCard)
        bassSwitch.setOnCheckedChangeListener { _, enabled -> if (!bassEngine.setEnabled(enabled)) { bassStatusText.text = "Não foi possível ativar o Bass Engine nesta rota."; bassSwitch.setOnCheckedChangeListener(null); bassSwitch.isChecked = false; bassSwitch.setOnCheckedChangeListener { _, value -> toggleBass(value) } } }
        bassStrength.setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
            override fun onProgressChanged(seekBar: SeekBar?, progress: Int, fromUser: Boolean) {
                bassValue.text = "${progress / 10}%"
                if (fromUser && !bassEngine.setStrength(progress)) bassStatusText.text = "O aparelho não aceitou o ajuste de intensidade."
            }
            override fun onStartTrackingTouch(seekBar: SeekBar?) = Unit
            override fun onStopTrackingTouch(seekBar: SeekBar?) = Unit
        })
        return page
    }

    private fun refreshBassEngine() {
        if (!::bassStatusText.isInitialized) return
        val status = bassEngine.connect()
        bassStatusText.text = status.message
        bassSwitch.setOnCheckedChangeListener(null)
        bassSwitch.isEnabled = status.available
        bassSwitch.isChecked = status.available && status.enabled
        bassStrength.isEnabled = status.available && status.strengthSupported
        bassStrength.progress = if (status.available) status.strength else 0
        bassValue.text = "${bassStrength.progress / 10}%"
        bassSwitch.setOnCheckedChangeListener { _, enabled -> toggleBass(enabled) }
    }

    private fun toggleBass(enabled: Boolean) {
        if (!bassEngine.setEnabled(enabled)) {
            bassStatusText.text = "Não foi possível alterar o Bass Engine."
            bassSwitch.setOnCheckedChangeListener(null)
            bassSwitch.isChecked = false
            bassSwitch.setOnCheckedChangeListener { _, value -> toggleBass(value) }
        }
    }

    private fun toggleEffect(checked: Boolean) {
        if (equalizer.setEnabled(checked)) preferences.edit().putBoolean("enabled", checked).apply()
        else statusText.text = "Não foi possível alterar o estado do efeito."
    }

    private fun applyPreset(preset: EqPreset, status: SystemEqualizerController.Status) {
        var allApplied = true
        val levels = mutableListOf<Int>()
        for (index in 0 until status.bandCount) {
            val frequency = equalizer.centerFrequencyHz(index)
            if (frequency == null) { allApplied = false; continue }
            val gainMb = (EqPreset.gainAt(preset, frequency.toDouble()) * 100.0).toInt()
            if (!equalizer.setBandLevel(index, gainMb)) allApplied = false
            levels.add(gainMb)
        }
        if (!allApplied) {
            statusText.text = "Não foi possível aplicar todas as bandas. O controle pode ter sido perdido."
            return
        }
        val editor = preferences.edit().putString("preset", preset.name)
        levels.forEachIndexed { index, level -> editor.putInt("band_level_$index", level) }
        editor.apply()
        bandSliders.forEachIndexed { index, slider ->
            val level = levels.getOrNull(index) ?: return@forEachIndexed
            slider.progress = (level - status.minLevelMb).coerceIn(0, slider.max)
            bandValues.getOrNull(index)?.text = String.format(Locale.getDefault(), "%+.1f dB", level / 100f)
        }
        updatePresetChipStyles(preset)
        updateCurveFromControls()
        statusText.text = "Preset ${preset.title} aplicado às bandas disponíveis."
    }

    private fun updateCurveFromControls() {
        val status = currentStatus ?: return
        val gains = bandSliders.map { slider -> (slider.progress + status.minLevelMb) / 100f }
        curveView.setGains(gains)
    }

    private fun updatePresetChipStyles(selected: EqPreset?) {
        presetChips.forEachIndexed { index, chip ->
            val preset = EqPreset.values().getOrNull(index)
            val active = preset != null && preset == selected
            chip.background = rounded(if (active) cyan else panelRaised, 14,
                if (active) cyan else 0xFF2A3947.toInt())
            chip.setTextColor(if (active) bg else white)
        }
    }

    private fun formatFrequency(hz: Int): String = when {
        hz >= 1000 -> String.format(Locale.getDefault(), "%.1f kHz", hz / 1000.0)
        else -> "${hz} Hz"
    }

    override fun onDestroy() {
        equalizer.release()
        bassEngine.release()
        super.onDestroy()
    }

    private inner class EqCurveView(context: android.content.Context) : View(context) {
        private val linePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = 0xFF2B3946.toInt()
            strokeWidth = dp(1).toFloat()
            style = Paint.Style.STROKE
        }
        private val curvePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = cyan
            strokeWidth = dp(2.5f.toInt()).toFloat()
            style = Paint.Style.STROKE
            strokeCap = Paint.Cap.ROUND
            strokeJoin = Paint.Join.ROUND
        }
        private val fillPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0x2259E1E8 }
        private val dotPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = cyan }
        private var gains: List<Float> = emptyList()

        fun setGains(values: List<Float>) {
            gains = values
            invalidate()
        }

        override fun onDraw(canvas: Canvas) {
            super.onDraw(canvas)
            val left = dp(4).toFloat()
            val right = width - dp(4).toFloat()
            val top = dp(12).toFloat()
            val bottom = height - dp(12).toFloat()
            val middle = (top + bottom) / 2f
            canvas.drawLine(left, middle, right, middle, linePaint)
            canvas.drawLine(left, top, right, top, linePaint.apply { alpha = 90 })
            canvas.drawLine(left, bottom, right, bottom, linePaint.apply { alpha = 90 })
            if (gains.isEmpty()) return
            val path = Path()
            val points = gains.mapIndexed { index, gain ->
                val x = if (gains.size == 1) (left + right) / 2f else left + (right - left) * index / (gains.size - 1)
                val y = middle - (gain.coerceIn(-12f, 12f) / 12f) * ((bottom - top) / 2f)
                x to y
            }
            points.forEachIndexed { index, point ->
                if (index == 0) path.moveTo(point.first, point.second)
                else path.lineTo(point.first, point.second)
            }
            val fill = Path(path)
            fill.lineTo(right, middle)
            fill.lineTo(left, middle)
            fill.close()
            canvas.drawPath(fill, fillPaint)
            canvas.drawPath(path, curvePaint)
            points.forEach { (x, y) -> canvas.drawCircle(x, y, dp(3).toFloat(), dotPaint) }
        }
    }
}
