const BOX_OPTIONS = ['Sem Caixa', 'Pequena', 'Média', 'Grande', 'Grande + Pequena', '2 Grandes', 'Múltiplas Caixas', 'Outro'];

function calculatePackaging(items = []) {
    const totals = items.reduce((acc, item) => {
        const qty = Number(item.quantity || 0);
        const category = String(item.category || '').toLowerCase();
        if (category === 'doce') acc.sweet += qty;
        else acc.savory += qty;
        return acc;
    }, { savory: 0, sweet: 0 });

    const occupancyTotal = totals.savory + (totals.sweet * 1.5);
    let suggestedBox = 'Múltiplas Caixas';
    if (occupancyTotal <= 6) suggestedBox = 'Média';
    else if (occupancyTotal <= 10) suggestedBox = 'Grande';

    return { occupancyTotal, suggestedBox, savoryQuantity: totals.savory, sweetQuantity: totals.sweet };
}

function normalizeUsedBox(value, fallback) {
    let v = String(value || '').trim();
    if (v === 'Caixa Pequena') v = 'Pequena';
    if (v === 'Caixa Média' || v === 'Caixa Media') v = 'Média';
    if (v === 'Caixa Grande') v = 'Grande';
    if (v === 'Sem caixa' || v === 'Sem embalagem') v = 'Sem Caixa';
    if (BOX_OPTIONS.includes(v)) return v;
    return fallback || 'Média';
}

module.exports = { BOX_OPTIONS, calculatePackaging, normalizeUsedBox };
