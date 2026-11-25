// A row of mutually exclusive choices built on real radio inputs, so arrow-key
// navigation and screen-reader semantics come from the browser.
export default function Segmented({ name, legend, options, value, onChange, className = '' }) {
  return (
    <fieldset className={`seg ${className}`}>
      <legend className="mc-field__label">{legend}</legend>
      <div className="seg__row" style={{ '--seg-count': options.length }}>
        {options.map((opt) => (
          <label key={opt.value} className="seg__option">
            <input
              type="radio"
              name={name}
              value={opt.value}
              checked={value === opt.value}
              onChange={() => onChange(opt.value)}
              className="seg__input"
            />
            <span className="seg__label">{opt.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
