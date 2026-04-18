const toNumber = (value) => Number.parseFloat(value || 0);

export const buildFallbackAnalysis = (metrics, locale = 'en', pythonInsights = null) => {
    const cv = toNumber(metrics?.cv);
    const tar = toNumber(metrics?.tar);
    const tbr = toNumber(metrics?.tbr);
    const tir = toNumber(metrics?.tir);
    const riskLevel = cv > 36 || tar > 25 ? 'high' : (tbr >= 4 || tir < 70 ? 'medium' : 'low');
    const isChinese = locale.toLowerCase().startsWith('zh');
    const dominantPattern = pythonInsights?.summary?.dominantPattern;
    const anomalies = pythonInsights?.anomalyCards || [];
    const anomalyHeadline = anomalies[0]?.title;
    const productStory = dominantPattern
        ? (isChinese ? `当前 Python 信号引擎识别出的主模式是“${dominantPattern}”，适合继续做成主动提醒、解释和复盘的闭环产品。` : `Python signal mining identified "${dominantPattern}" as the leading pattern, which is a strong fit for proactive alerts, explanation, and follow-up workflows.`)
        : (isChinese ? '当前结果适合继续做成可解释、可追踪的 AI 健康管理体验。' : 'The current output is a good fit for an explainable, trackable AI health workflow.');

    if (riskLevel === 'high') {
        return {
            risk_level: riskLevel,
            pathology_summary: isChinese
                ? `患者 TIR 为 ${metrics.tir}%，CV 为 ${metrics.cv}%，TAR 为 ${metrics.tar}%。结果提示血糖波动和高血糖暴露偏高，可能增加氧化应激、内皮功能障碍、视网膜微血管渗漏以及早期肾脏微血管损伤风险。${anomalyHeadline ? `当前最突出的模式是“${anomalyHeadline}”。` : ''}建议结合真实病史、用药和餐后曲线进一步复核。`
                : `Patient TIR is ${metrics.tir}% with CV ${metrics.cv}% and TAR ${metrics.tar}%. The pattern suggests elevated glycemic variability and hyperglycemic exposure, which may increase oxidative stress, endothelial dysfunction, retinal microvascular leakage, and early nephropathy risk.${anomalyHeadline ? ` The leading signal is "${anomalyHeadline}".` : ''} Review this with medication, meals, and clinical history.`,
            video_generation_prompt: 'Cinematic medical animation inside retinal microvessels. Erratic blood sugar fluctuations trigger oxidative stress, endothelial swelling, capillary wall leakage, red blood cell clustering, and a dark inflammatory atmosphere. Hyper-realistic 3D pathology visualization.',
            recommendations: isChinese
                ? ['复查餐后高峰与夜间波动', '结合胰岛素或降糖药方案评估', '关注眼底和肾功能筛查']
                : ['Review post-meal peaks and overnight variability', 'Evaluate therapy timing and dosing with a clinician', 'Prioritize retinal and kidney screening when clinically appropriate'],
            clinical_focus: isChinese ? '高波动与高血糖暴露' : 'High variability and hyperglycemic exposure',
            product_story: productStory
        };
    }

    if (riskLevel === 'medium') {
        return {
            risk_level: riskLevel,
            pathology_summary: isChinese
                ? `患者 TIR 为 ${metrics.tir}%，TBR 为 ${metrics.tbr}%，整体控制接近目标但仍存在可优化区间。需要重点排查低血糖时段和餐后短暂升高，避免长期波动累积为微血管风险。`
                : `Patient TIR is ${metrics.tir}% and TBR is ${metrics.tbr}%. Overall control is close to target, but the trace still has optimization opportunities. Review low-glucose periods and brief post-meal rises to reduce cumulative microvascular stress.`,
            video_generation_prompt: 'Clean 3D medical animation of capillary blood flow with intermittent narrowing and mild glucose fluctuation. Mostly stable vessel walls with brief stress signals and soft clinical lighting.',
            recommendations: isChinese
                ? ['定位低血糖发生时间', '复核餐食与运动记录', '继续观察 TIR 是否稳定超过 70%']
                : ['Identify timing of low-glucose events', 'Review meals and exercise logs', 'Track whether TIR remains above 70%'],
            clinical_focus: isChinese ? '局部时段优化' : 'Targeted optimization windows',
            product_story: productStory
        };
    }

    return {
        risk_level: riskLevel,
        pathology_summary: isChinese
            ? `患者 TIR 为 ${metrics.tir}%，CV 为 ${metrics.cv}%，血糖稳定性较好。当前数据提示微血管压力较低，但仍建议持续监测低血糖和餐后短时升糖。`
            : `Patient demonstrates stable glycemic control with TIR ${metrics.tir}% and CV ${metrics.cv}%. Current data suggests lower microvascular stress, while ongoing monitoring for hypoglycemia and post-meal excursions remains appropriate.`,
        video_generation_prompt: 'Cinematic medical animation inside a healthy capillary. Smooth blood flow, flexible vessel walls, organized endothelial cells, soft lighting, and a stable metabolic environment.',
        recommendations: isChinese
            ? ['保持当前监测节奏', '继续关注餐后两小时曲线', '定期复查长期并发症风险']
            : ['Maintain the current monitoring routine', 'Continue checking two-hour post-meal patterns', 'Repeat complication screening on the usual clinical schedule'],
        clinical_focus: isChinese ? '长期趋势追踪' : 'Longitudinal monitoring',
        product_story: productStory
    };
};
