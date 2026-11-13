class Component extends DCLogic {
  state = { tab: this.props.initialTab ?? 'Financials', uw: 0 };
  renderVals() {
    const s = this.state, on = 'var(--color-accent)';
    const labels = ['File workspace', 'Underwriting', 'Financials', 'Payments', 'Reviewer controls', 'Communications', 'Audit trail'];
    const uw = [['Client terms', 'v3 · $1,156,000 · 9.25%'], ['Offer published', 'Prepare and share marketplace offer'], ['Client response', 'Not delivered'], ['Closing', 'After client acceptance']];
    const ps = this.props.planState ?? 'Working draft';
    const plan = { 'Working draft': { chip: 'Working draft', tag: 'tag tag-neutral', note: 'Recommended · coverage below 1.10x or negative earnings' }, 'Client submitted': { chip: 'Client submitted · review needed', tag: 'tag tag-warning', note: 'Client proposals remain conditional until reviewed' }, 'Published': { chip: 'Published v1', tag: 'tag tag-success', note: 'Reviewed changes are included in projected coverage' } }[ps];
    return {
      tabs: labels.map(label => ({ label, go: () => this.setState({ tab: label }), weight: s.tab === label ? 600 : 400, ink: s.tab === label ? 'var(--color-text)' : 'var(--color-text-muted)', line: s.tab === label ? on : 'transparent' })),
      isFinancials: s.tab === 'Financials', isUnderwriting: s.tab === 'Underwriting', isOther: s.tab !== 'Financials' && s.tab !== 'Underwriting', otherLabel: s.tab,
      goUnderwriting: () => this.setState({ tab: 'Underwriting', uw: 0 }), toResponse: () => this.setState({ uw: 2 }), plan,
      uwSteps: uw.map(([title, sub], i) => ({ n: i === 0 ? '✓' : i + 1, title, sub, go: () => this.setState({ uw: i }), border: s.uw === i ? on : 'var(--color-divider)', bg: s.uw === i ? 'var(--color-accent-100)' : 'var(--color-surface)', dot: i === 0 ? 'var(--color-success)' : s.uw === i ? on : 'var(--color-neutral-200)', dotInk: i === 0 || s.uw === i ? 'var(--color-on-accent)' : 'var(--color-text)' })),
      uwTerms: s.uw === 0, uwOffer: s.uw === 1, uwAccepted: s.uw === 2, uwClose: s.uw === 3,
    };
  }
}
