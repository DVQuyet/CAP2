import { normalizeDateInput } from "../utils/dateFormat";

export default function DateInput({
  value,
  onChange,
  name,
  required = false,
  disabled = false,
  className = "",
  placeholder = "dd/mm/yyyy",
  ...props
}) {
  const handleChange = (event) => {
    const nextValue = normalizeDateInput(event.target.value);
    if (typeof onChange === "function") {
      onChange({
        ...event,
        target: {
          ...event.target,
          name,
          value: nextValue,
        },
      });
    }
  };

  return (
    <input
      {...props}
      type="text"
      inputMode="numeric"
      name={name}
      value={value || ""}
      onChange={handleChange}
      required={required}
      disabled={disabled}
      className={className}
      placeholder={placeholder}
      maxLength={10}
      autoComplete="off"
    />
  );
}
