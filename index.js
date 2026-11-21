/**
 * Host half of the billing-hud bundle.
 *
 * Everything lives in the Client half: the `priceBand` service owns the holiday
 * calendar, its yearly refresh, and the localStorage cache; the same client
 * module renders the composer cost readout, the sidebar balance row, and the
 * settings page that configures both. This half only has to exist so the row
 * activates and publishes its Client module.
 */
export function apply() {}
