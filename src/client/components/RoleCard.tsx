import type { RoleDefinition } from '../../shared/types.js';

export default function RoleCard({ role }: { role: RoleDefinition }) {
  return (
    <section className={`role-card ${role.team}`}>
      <div className="role-card-heading"><span>Your secret role</span><span className={`team-badge ${role.team}`}>{role.team}</span></div>
      <div className="role-icon" aria-hidden="true">{role.icon}</div>
      <p className="role-category">{role.category}</p>
      <h2>{role.name}</h2>
      <p className="role-summary">{role.summary}</p>
      <div className="role-ability">{role.ability}</div>
      <p className="role-goal">{role.team === 'good' ? 'Good wins when the Demon dies without a successor.' : 'Evil wins when only two players remain alive.'}</p>
    </section>
  );
}
