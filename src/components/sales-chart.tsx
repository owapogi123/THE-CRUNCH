import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer } from "recharts"

const data = [
  { day: "Sat", value: 0 },
  { day: "Sun", value: 50000 },
  { day: "Mon", value: 3000 },
  { day: "Tue", value: 90000 },
  { day: "Wed", value: 40000 },
  { day: "Thu", value: 50000 },
  { day: "Fri", value: 5000 },
]

export function SalesChart() {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#E5D5B8" />
        <XAxis dataKey="day" stroke="#8B3A3A" tick={{ fill: "#4A1C1C" }} />
        <YAxis stroke="#8B3A3A" tick={{ fill: "#4A1C1C" }} tickFormatter={(value) => `${value / 1000}k`} />
        <Line type="linear" dataKey="value" stroke="#8B3A3A" strokeWidth={2} dot={{ fill: "#8B3A3A", r: 4 }} />
      </LineChart>
    </ResponsiveContainer>
  )
}
