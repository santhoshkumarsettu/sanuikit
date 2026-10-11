import Link from "next/link";
import { Badge } from "sanui";
import { demoUnits, formatCurrency } from "@vstudio/utils";
import { AppShell } from "../../components/app-shell";

export default function BookingsPage() {
  const reservations = demoUnits.filter(
    (unit) => unit.status === "RESERVED" || unit.status === "BOOKED",
  );
  return (
    <AppShell><div className="bookings-page">
      <div className="page-title-row">
        <div>
          <p className="page-eyebrow">Green Valley</p>
          <h1 className="page-title">Bookings</h1>
          <p className="page-subtitle">
            Track reservations and customer follow-ups.
          </p>
        </div>
        <Link className="sanui-button sanui-button--secondary bookings-inventory-link" href="/inventory">
          View inventory →
        </Link>
      </div>
      <section className="surface-card bookings-card">
        <div className="inventory-toolbar">
          <div className="inventory-search">
            <input
              placeholder="Search by unit or customer"
              aria-label="Search bookings"
            />
          </div>
          <select className="sanui-select filter-select" aria-label="Filter booking status">
            <option>All booking statuses</option>
            <option>Pending</option>
            <option>Confirmed</option>
            <option>Cancelled</option>
          </select>
        </div>
        <div className="table-scroll">
          <table className="inventory-table bookings-table">
            <thead>
              <tr>
                <th>Unit</th>
                <th>Customer</th>
                <th>Status</th>
                <th>Unit value</th>
                <th>Created</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {reservations.map((unit, index) => (
                <tr key={unit.id}>
                  <td>
                    <strong>{unit.unitNumber}</strong>
                  </td>
                  <td>
                    <strong>
                      {index === 0 ? "Priya Sharma" : "Rahul Mehta"}
                    </strong>
                    <small className="table-secondary">
                      {index === 0 ? "priya@example.com" : "rahul@example.com"}
                    </small>
                  </td>
                  <td>
                    <Badge
                      tone={unit.status === "RESERVED" ? "warning" : "info"}
                    >
                      {unit.status === "RESERVED" ? "Pending" : "Confirmed"}
                    </Badge>
                  </td>
                  <td>{formatCurrency(unit.price)}</td>
                  <td>{index === 0 ? "Today, 10:32 AM" : "Oct 8, 2026"}</td>
                  <td>
                    <button type="button" className="text-button">
                      View details
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="list-footer">Showing sample reservation data</div>
      </section>
    </div></AppShell>
  );
}
