/**
 * Seed script — creates demo companies, departments, role mappings,
 * mock users, and a full suite of published forms across all departments.
 *
 * Run: npm run db:seed
 */

import { PrismaClient } from "@prisma/client";
import { getMockUsers } from "../src/lib/ldap";
import { upsertUserFromLdap } from "../src/lib/user-sync";

const prisma = new PrismaClient();

function toUrlSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

async function generateUniqueSlug(title: string): Promise<string> {
  const base = toUrlSlug(title) || "form";
  let candidate = base;
  let suffix = 2;
  while (await prisma.form.findUnique({ where: { slug: candidate } })) {
    candidate = `${base}-${suffix++}`;
  }
  return candidate;
}

async function createPublishedForm({
  title,
  description,
  departmentId,
  createdById,
  schemaJson,
  workflowJson,
}: {
  title: string;
  description: string;
  departmentId: string;
  createdById: string;
  schemaJson: object;
  workflowJson: object;
}) {
  const existing = await prisma.form.findFirst({ where: { title, departmentId } });
  if (existing) {
    console.log(`    "${title}" already exists, skipping`);
    return existing;
  }

  const slug = await generateUniqueSlug(title);

  const form = await prisma.form.create({
    data: {
      title,
      slug,
      description,
      departmentId,
      status: "PUBLISHED",
      createdById,
      versions: {
        create: {
          version: 1,
          schemaJson,
          workflowJson,
          publishedAt: new Date(),
          publishedById: createdById,
        },
      },
    },
    include: { versions: true },
  });

  await prisma.form.update({
    where: { id: form.id },
    data: { currentVersionId: form.versions[0].id },
  });

  await prisma.formAudience.upsert({
    where: { formId: form.id },
    update: {},
    create: {
      formId: form.id,
      companies: [],
      departments: [],
      designations: [],
      adGroups: [],
    },
  });

  console.log(`    ✓ "${title}" (id=${form.id})`);
  return form;
}

async function main() {
  console.log("🌱 Seeding FormFlow database...\n");

  // ── Companies ────────────────────────────────────────────────────────────
  const acme = await prisma.company.upsert({
    where: { code: "ACME" },
    update: {},
    create: { code: "ACME", name: "Acme Industries Ltd.", active: true },
  });
  const globex = await prisma.company.upsert({
    where: { code: "GLBX" },
    update: {},
    create: { code: "GLBX", name: "Globex Holdings Ltd.", active: true },
  });
  console.log(`  Companies: ${acme.code}, ${globex.code}`);

  // ── Departments (global — no companyId) ─────────────────────────────────
  async function upsertDept(code: string, name: string) {
    const existing = await prisma.department.findFirst({ where: { code } });
    if (existing) {
      await prisma.department.update({ where: { id: existing.id }, data: { name, active: true } });
      return existing;
    }
    return prisma.department.create({ data: { code, name, active: true } });
  }
  const itDeptObj    = await upsertDept("IT",    "Information Technology");
  const hrDeptObj    = await upsertDept("HR",    "Human Resources");
  const finDeptObj   = await upsertDept("FIN",   "Finance");
  const adminDeptObj = await upsertDept("ADMIN", "Administration");
  const allDepts = [itDeptObj, hrDeptObj, finDeptObj, adminDeptObj];
  console.log(`  Departments: ${allDepts.length} seeded (global)`);

  // ── CompanyDepartment links — every dept linked to every company by default ─
  const allCompanies = [acme, globex];
  for (const co of allCompanies) {
    for (const dept of allDepts) {
      await prisma.companyDepartment.upsert({
        where: { companyId_departmentId: { companyId: co.id, departmentId: dept.id } },
        update: {},
        create: { companyId: co.id, departmentId: dept.id, active: true },
      });
    }
  }
  console.log(`  CompanyDepartment links: ${allCompanies.length * allDepts.length} created`);

  // ── Designations (global) ─────────────────────────────────────────────────
  const designationNames = [
    "System Administrator", "IT Manager", "HR Manager", "Finance Manager",
    "General Manager", "Director", "Manager", "Assistant Manager",
    "Senior Engineer", "Engineer", "Officer", "Executive", "Analyst",
  ];
  const designationMap: Record<string, { id: string; name: string }> = {};
  for (const name of designationNames) {
    const d = await prisma.designation.upsert({
      where: { name },
      update: { active: true },
      create: { name, active: true },
    });
    designationMap[name] = d;
  }
  console.log(`  Designations: ${designationNames.length} seeded (global)`);

  // Link every designation to every company by default
  for (const co of allCompanies) {
    for (const desig of Object.values(designationMap)) {
      await prisma.companyDesignation.upsert({
        where: { companyId_designationId: { companyId: co.id, designationId: desig.id } },
        update: {},
        create: { companyId: co.id, designationId: desig.id, active: true },
      });
    }
  }
  console.log(`  CompanyDesignation links: ${allCompanies.length * designationNames.length} created`);

  // ── Role Mappings ────────────────────────────────────────────────────────
  const roleMappings = [
    { adGroup: "FormFlow-SuperAdmins", appRole: "SUPER_ADMIN" as const, deptAdminOf: null },
    { adGroup: "FormFlow-IT-Admins",   appRole: "DEPT_ADMIN" as const, deptAdminOf: null },
    { adGroup: "FormFlow-HR-Admins",   appRole: "DEPT_ADMIN" as const, deptAdminOf: null },
  ];

  for (const mapping of roleMappings) {
    await prisma.roleMapping.upsert({
      where: { adGroup: mapping.adGroup },
      update: { appRole: mapping.appRole },
      create: mapping,
    });
  }
  console.log(`  Role mappings: ${roleMappings.length} seeded`);

  // ── Mock users ───────────────────────────────────────────────────────────
  const mockUsers = getMockUsers();
  let usersCreated = 0;
  for (const user of mockUsers) {
    try {
      await upsertUserFromLdap(user);
      usersCreated++;
    } catch (err) {
      console.error(`  Failed to upsert ${user.samAccountName}:`, err);
    }
  }
  console.log(`  Users: ${usersCreated} synced from mock LDAP`);

  await prisma.user.updateMany({
    where: { samAccountName: "superadmin" },
    data: { role: "SUPER_ADMIN" },
  });
  await prisma.user.updateMany({
    where: { samAccountName: { in: ["itadmin", "hradmin"] } },
    data: { role: "DEPT_ADMIN" },
  });

  // ── Explicitly set org assignments for mock users (profileComplete=true) ─
  // LDAP no longer syncs company/dept/designation; seed does it explicitly.
  const orgAssignments: Array<{ sam: string; companyId: string; departmentId: string; designation: string }> = [
    { sam: "superadmin", companyId: acme.id, departmentId: itDeptObj.id,    designation: "System Administrator" },
    { sam: "itadmin",    companyId: acme.id, departmentId: itDeptObj.id,    designation: "IT Manager" },
    { sam: "hradmin",    companyId: globex.id, departmentId: hrDeptObj.id,    designation: "HR Manager" },
    { sam: "jdoe",       companyId: acme.id, departmentId: itDeptObj.id,    designation: "Officer" },
    { sam: "asmith",     companyId: globex.id, departmentId: hrDeptObj.id,    designation: "Officer" },
    { sam: "manager1",   companyId: acme.id, departmentId: itDeptObj.id,    designation: "General Manager" },
  ];
  for (const a of orgAssignments) {
    await prisma.user.updateMany({
      where: { samAccountName: a.sam },
      data: { companyId: a.companyId, departmentId: a.departmentId, designation: a.designation, profileComplete: true },
    });
  }
  console.log(`  User org assignments: ${orgAssignments.length} set`);

  // ── Resolve departments & admins for form creation ────────────────────────
  const itDept    = await prisma.department.findFirst({ where: { code: "IT"    } });
  const hrDept    = await prisma.department.findFirst({ where: { code: "HR"    } });
  const finDept   = await prisma.department.findFirst({ where: { code: "FIN"   } });
  const adminDept = await prisma.department.findFirst({ where: { code: "ADMIN" } });

  const superAdmin = await prisma.user.findFirst({ where: { samAccountName: "superadmin" } });
  const itAdmin    = await prisma.user.findFirst({ where: { samAccountName: "itadmin" } });
  const hrAdmin    = await prisma.user.findFirst({ where: { samAccountName: "hradmin" } });

  // Use superadmin as fallback creator for Finance & Admin (no dedicated admin in mock users)
  const finAdmin   = superAdmin;
  const adminUser  = superAdmin;

  // ══════════════════════════════════════════════════════════════════════════
  // IT DEPARTMENT FORMS
  // ══════════════════════════════════════════════════════════════════════════
  if (itDept && itAdmin) {
    console.log("\n  📁 IT Department forms:");

    // ── 1. IT Asset Request ────────────────────────────────────────────────
    await createPublishedForm({
      title: "IT Asset Request",
      description: "Request for IT hardware assets. Routed through manager then IT for approval.",
      departmentId: itDept.id,
      createdById: itAdmin.id,
      schemaJson: {
        version: 1,
        pages: [{
          title: "Request Details",
          fields: [
            { key: "asset_type", type: "dropdown", label: "Asset Type", required: true, width: "half",
              options: ["Laptop", "Desktop", "Monitor", "Keyboard", "Mouse", "Headset", "Other"],
              visibleIf: null, stepEditable: null },
            { key: "asset_other", type: "text", label: "Specify Asset (if Other)", required: false, width: "half",
              visibleIf: { logic: "AND", rules: [{ fieldKey: "asset_type", operator: "==", value: "Other" }] }, stepEditable: null },
            { key: "purpose", type: "textarea", label: "Purpose / Justification", required: true, width: "full",
              placeholder: "Explain why you need this asset...", visibleIf: null, stepEditable: null },
            { key: "urgency", type: "radio", label: "Urgency", required: true, width: "half",
              options: ["Low", "Medium", "High"], visibleIf: null, stepEditable: null },
            { key: "required_by", type: "date", label: "Required By", required: false, width: "half",
              visibleIf: null, stepEditable: null },
            { key: "it_remarks", type: "textarea", label: "IT Remarks", required: false,
              adminOnly: true, stepEditable: "it-review", width: "full", visibleIf: null },
          ],
        }],
      },
      workflowJson: {
        version: 1,
        nodes: [
          { id: "start", type: "start", position: { x: 250, y: 50 }, data: { label: "Start" } },
          { id: "manager-approval", type: "approval", position: { x: 250, y: 160 },
            data: { label: "Manager Approval", strategy: "manager_of_submitter",
              requireAll: false, allowReturn: true, slaDays: 2, escalateAfterReminders: 2 } },
          { id: "urgency-branch", type: "condition", position: { x: 250, y: 290 },
            data: { label: "High Priority?",
              branches: [
                { id: "high",   label: "High Urgency", targetNodeId: "it-head",    rules: [{ fieldKey: "urgency", operator: "==", value: "High" }],  logic: "AND" },
                { id: "normal", label: "Normal",        targetNodeId: "it-manager", rules: [], logic: "AND" },
              ] } },
          { id: "it-head", type: "approval", position: { x: 80, y: 420 },
            data: { label: "IT Head Approval", strategy: "department_head",
              requireAll: false, allowReturn: false, slaDays: 3 } },
          { id: "it-manager", type: "approval", position: { x: 420, y: 420 },
            data: { label: "IT Manager Review", strategy: "designation_in_dept",
              designation: "IT Manager", departmentId: itDept.id,
              requireAll: false, allowReturn: false, slaDays: 5 } },
          { id: "end-approved", type: "end-approved", position: { x: 250, y: 560 }, data: { label: "Approved" } },
          { id: "end-rejected", type: "end-rejected", position: { x: 480, y: 560 }, data: { label: "Rejected" } },
        ],
        edges: [
          { id: "e1", source: "start",            target: "manager-approval" },
          { id: "e2", source: "manager-approval", target: "urgency-branch" },
          { id: "e3", source: "urgency-branch",   target: "it-head",    sourceHandle: "high" },
          { id: "e4", source: "urgency-branch",   target: "it-manager", sourceHandle: "normal" },
          { id: "e5", source: "it-head",          target: "end-approved" },
          { id: "e6", source: "it-manager",       target: "end-approved" },
        ],
      },
    });

    // ── 2. IT Support / Help Desk Request ─────────────────────────────────
    await createPublishedForm({
      title: "IT Support Request",
      description: "Log a support ticket for IT issues — hardware, software, network, or access problems.",
      departmentId: itDept.id,
      createdById: itAdmin.id,
      schemaJson: {
        version: 1,
        pages: [{
          title: "Issue Details",
          fields: [
            { key: "category", type: "dropdown", label: "Issue Category", required: true, width: "half",
              options: ["Hardware", "Software", "Network / Connectivity", "Email / Outlook", "Printer", "Access / Permissions", "Other"],
              visibleIf: null, stepEditable: null },
            { key: "priority", type: "radio", label: "Priority", required: true, width: "half",
              options: ["Low", "Medium", "High", "Critical"], visibleIf: null, stepEditable: null },
            { key: "asset_tag", type: "text", label: "Asset Tag / Device Name", required: false, width: "half",
              placeholder: "e.g. PC-ACME-0042", visibleIf: null, stepEditable: null },
            { key: "location", type: "text", label: "Location / Floor / Desk", required: false, width: "half",
              placeholder: "e.g. 3rd Floor, Desk 12", visibleIf: null, stepEditable: null },
            { key: "subject", type: "text", label: "Issue Subject", required: true, width: "full",
              placeholder: "Brief one-line description", visibleIf: null, stepEditable: null },
            { key: "description", type: "textarea", label: "Detailed Description", required: true, width: "full",
              placeholder: "Describe the issue, steps to reproduce, and any error messages...",
              visibleIf: null, stepEditable: null },
            { key: "since_when", type: "datetime", label: "Issue Started Since", required: false, width: "half",
              visibleIf: null, stepEditable: null },
            { key: "attachment", type: "file-upload", label: "Screenshot / Attachment", required: false, width: "full",
              fileConfig: { accept: ["image/*", "application/pdf"], maxSizeMb: 5, multiple: true },
              visibleIf: null, stepEditable: null },
            { key: "it_notes", type: "textarea", label: "IT Resolution Notes", required: false,
              adminOnly: true, stepEditable: "it-resolve", width: "full", visibleIf: null },
          ],
        }],
      },
      workflowJson: {
        version: 1,
        nodes: [
          { id: "start", type: "start", position: { x: 250, y: 50 }, data: { label: "Start" } },
          { id: "priority-branch", type: "condition", position: { x: 250, y: 160 },
            data: { label: "Critical?",
              branches: [
                { id: "critical", label: "Critical", targetNodeId: "it-head-alert", rules: [{ fieldKey: "priority", operator: "==", value: "Critical" }], logic: "AND" },
                { id: "normal",   label: "Normal",   targetNodeId: "it-resolve",    rules: [], logic: "AND" },
              ] } },
          { id: "it-head-alert", type: "approval", position: { x: 80, y: 290 },
            data: { label: "IT Head — Immediate Action", strategy: "department_head",
              requireAll: false, allowReturn: false, slaDays: 1 } },
          { id: "it-resolve", type: "approval", position: { x: 420, y: 290 },
            data: { label: "IT Team Resolution", strategy: "designation_in_dept",
              designation: "IT Support Engineer", departmentId: itDept.id,
              requireAll: false, allowReturn: true, slaDays: 3 } },
          { id: "end-approved", type: "end-approved", position: { x: 250, y: 440 }, data: { label: "Resolved" } },
        ],
        edges: [
          { id: "e1", source: "start",          target: "priority-branch" },
          { id: "e2", source: "priority-branch", target: "it-head-alert", sourceHandle: "critical" },
          { id: "e3", source: "priority-branch", target: "it-resolve",    sourceHandle: "normal" },
          { id: "e4", source: "it-head-alert",  target: "end-approved" },
          { id: "e5", source: "it-resolve",     target: "end-approved" },
        ],
      },
    });

    // ── 3. Software Installation Request ──────────────────────────────────
    await createPublishedForm({
      title: "Software Installation Request",
      description: "Request installation of licensed or open-source software on your workstation.",
      departmentId: itDept.id,
      createdById: itAdmin.id,
      schemaJson: {
        version: 1,
        pages: [{
          title: "Software Details",
          fields: [
            { key: "software_name", type: "text", label: "Software Name", required: true, width: "half",
              placeholder: "e.g. Adobe Acrobat Pro", visibleIf: null, stepEditable: null },
            { key: "version", type: "text", label: "Version (if specific)", required: false, width: "half",
              placeholder: "e.g. 2024 or leave blank for latest", visibleIf: null, stepEditable: null },
            { key: "license_type", type: "radio", label: "License Type", required: true, width: "half",
              options: ["Company Licensed", "Open Source / Free", "Trial", "Purchase Required"],
              visibleIf: null, stepEditable: null },
            { key: "license_cost", type: "number", label: "Estimated Cost (₹)", required: false, width: "half",
              visibleIf: { logic: "AND", rules: [{ fieldKey: "license_type", operator: "==", value: "Purchase Required" }] },
              stepEditable: null },
            { key: "device_details", type: "text", label: "Device / Asset Tag", required: true, width: "half",
              placeholder: "PC-ACME-0042", visibleIf: null, stepEditable: null },
            { key: "os", type: "dropdown", label: "Operating System", required: true, width: "half",
              options: ["Windows 10", "Windows 11", "macOS", "Linux"],
              visibleIf: null, stepEditable: null },
            { key: "business_justification", type: "textarea", label: "Business Justification", required: true, width: "full",
              placeholder: "How will this software improve your work?",
              visibleIf: null, stepEditable: null },
            { key: "it_approval_notes", type: "textarea", label: "IT Approval Notes", required: false,
              adminOnly: true, stepEditable: "it-approve", width: "full", visibleIf: null },
          ],
        }],
      },
      workflowJson: {
        version: 1,
        nodes: [
          { id: "start", type: "start", position: { x: 250, y: 50 }, data: { label: "Start" } },
          { id: "manager-approval", type: "approval", position: { x: 250, y: 160 },
            data: { label: "Manager Approval", strategy: "manager_of_submitter",
              requireAll: false, allowReturn: true, slaDays: 2 } },
          { id: "cost-branch", type: "condition", position: { x: 250, y: 290 },
            data: { label: "Purchase Required?",
              branches: [
                { id: "purchase", label: "Purchase Required", targetNodeId: "fin-approve",  rules: [{ fieldKey: "license_type", operator: "==", value: "Purchase Required" }], logic: "AND" },
                { id: "free",     label: "Free / Licensed",   targetNodeId: "it-approve",   rules: [], logic: "AND" },
              ] } },
          { id: "it-approve", type: "approval", position: { x: 420, y: 420 },
            data: { label: "IT Approval", strategy: "department_head",
              requireAll: false, allowReturn: false, slaDays: 3 } },
          { id: "fin-approve", type: "approval", position: { x: 80, y: 420 },
            data: { label: "Finance Approval (Purchase)", strategy: "designation_in_dept",
              designation: "Finance Manager", departmentId: itDept.id,
              requireAll: false, allowReturn: false, slaDays: 3 } },
          { id: "end-approved", type: "end-approved", position: { x: 250, y: 560 }, data: { label: "Approved" } },
          { id: "end-rejected", type: "end-rejected", position: { x: 480, y: 560 }, data: { label: "Rejected" } },
        ],
        edges: [
          { id: "e1", source: "start",            target: "manager-approval" },
          { id: "e2", source: "manager-approval", target: "cost-branch" },
          { id: "e3", source: "cost-branch",      target: "fin-approve", sourceHandle: "purchase" },
          { id: "e4", source: "cost-branch",      target: "it-approve",  sourceHandle: "free" },
          { id: "e5", source: "fin-approve",      target: "it-approve" },
          { id: "e6", source: "it-approve",       target: "end-approved" },
        ],
      },
    });

    // ── 4. VPN / Remote Access Request ────────────────────────────────────
    await createPublishedForm({
      title: "VPN / Remote Access Request",
      description: "Request VPN credentials or remote desktop access for working outside the office.",
      departmentId: itDept.id,
      createdById: itAdmin.id,
      schemaJson: {
        version: 1,
        pages: [{
          title: "Access Details",
          fields: [
            { key: "access_type", type: "radio", label: "Access Type", required: true, width: "half",
              options: ["VPN Access", "Remote Desktop (RDP)", "Both"],
              visibleIf: null, stepEditable: null },
            { key: "duration_type", type: "radio", label: "Duration", required: true, width: "half",
              options: ["Temporary (specific dates)", "Permanent"],
              visibleIf: null, stepEditable: null },
            { key: "start_date", type: "date", label: "Access From", required: false, width: "half",
              visibleIf: { logic: "AND", rules: [{ fieldKey: "duration_type", operator: "==", value: "Temporary (specific dates)" }] },
              stepEditable: null },
            { key: "end_date", type: "date", label: "Access Until", required: false, width: "half",
              visibleIf: { logic: "AND", rules: [{ fieldKey: "duration_type", operator: "==", value: "Temporary (specific dates)" }] },
              stepEditable: null },
            { key: "personal_device", type: "yes-no", label: "Using Personal Device?", required: true, width: "half",
              visibleIf: null, stepEditable: null },
            { key: "device_specs", type: "text", label: "Device OS & Antivirus", required: false, width: "half",
              placeholder: "e.g. Windows 11, Kaspersky",
              visibleIf: { logic: "AND", rules: [{ fieldKey: "personal_device", operator: "==", value: "true" }] },
              stepEditable: null },
            { key: "justification", type: "textarea", label: "Business Justification", required: true, width: "full",
              placeholder: "Why do you need remote access?",
              visibleIf: null, stepEditable: null },
            { key: "it_notes", type: "textarea", label: "IT Setup Notes", required: false,
              adminOnly: true, stepEditable: "it-setup", width: "full", visibleIf: null },
          ],
        }],
      },
      workflowJson: {
        version: 1,
        nodes: [
          { id: "start", type: "start", position: { x: 250, y: 50 }, data: { label: "Start" } },
          { id: "manager-approval", type: "approval", position: { x: 250, y: 160 },
            data: { label: "Manager Approval", strategy: "manager_of_submitter",
              requireAll: false, allowReturn: true, slaDays: 2 } },
          { id: "it-setup", type: "approval", position: { x: 250, y: 290 },
            data: { label: "IT Security Review", strategy: "department_head",
              requireAll: false, allowReturn: false, slaDays: 2 } },
          { id: "end-approved", type: "end-approved", position: { x: 250, y: 420 }, data: { label: "Access Granted" } },
          { id: "end-rejected", type: "end-rejected", position: { x: 450, y: 420 }, data: { label: "Rejected" } },
        ],
        edges: [
          { id: "e1", source: "start",            target: "manager-approval" },
          { id: "e2", source: "manager-approval", target: "it-setup" },
          { id: "e3", source: "it-setup",         target: "end-approved" },
        ],
      },
    });

    // ── 5. System / Application Access Request ────────────────────────────
    await createPublishedForm({
      title: "System Access Request",
      description: "Request access to internal business applications, shared drives, or ERP modules.",
      departmentId: itDept.id,
      createdById: itAdmin.id,
      schemaJson: {
        version: 1,
        pages: [{
          title: "Access Request",
          fields: [
            { key: "system_name", type: "dropdown", label: "System / Application", required: true, width: "half",
              options: ["ERP (SAP)", "CRM", "File Server / Shared Drive", "Email Distribution Group",
                        "HR Portal", "Finance Module", "BI / Reports Portal", "Other"],
              visibleIf: null, stepEditable: null },
            { key: "system_other", type: "text", label: "Specify System", required: false, width: "half",
              visibleIf: { logic: "AND", rules: [{ fieldKey: "system_name", operator: "==", value: "Other" }] },
              stepEditable: null },
            { key: "access_level", type: "radio", label: "Access Level Required", required: true, width: "half",
              options: ["Read Only", "Read / Write", "Admin / Full Access"],
              visibleIf: null, stepEditable: null },
            { key: "duration_type", type: "radio", label: "Duration", required: true, width: "half",
              options: ["Permanent", "Temporary"],
              visibleIf: null, stepEditable: null },
            { key: "access_until", type: "date", label: "Access Until", required: false, width: "half",
              visibleIf: { logic: "AND", rules: [{ fieldKey: "duration_type", operator: "==", value: "Temporary" }] },
              stepEditable: null },
            { key: "justification", type: "textarea", label: "Justification", required: true, width: "full",
              placeholder: "Why do you need this access? Reference project or task.",
              visibleIf: null, stepEditable: null },
            { key: "it_action_notes", type: "textarea", label: "IT Action Taken", required: false,
              adminOnly: true, stepEditable: "it-provision", width: "full", visibleIf: null },
          ],
        }],
      },
      workflowJson: {
        version: 1,
        nodes: [
          { id: "start", type: "start", position: { x: 250, y: 50 }, data: { label: "Start" } },
          { id: "manager-approval", type: "approval", position: { x: 250, y: 160 },
            data: { label: "Manager Approval", strategy: "manager_of_submitter",
              requireAll: false, allowReturn: true, slaDays: 2 } },
          { id: "access-branch", type: "condition", position: { x: 250, y: 290 },
            data: { label: "Admin Access?",
              branches: [
                { id: "admin",  label: "Admin / Full Access", targetNodeId: "it-head-approval", rules: [{ fieldKey: "access_level", operator: "==", value: "Admin / Full Access" }], logic: "AND" },
                { id: "normal", label: "Standard Access",     targetNodeId: "it-provision",     rules: [], logic: "AND" },
              ] } },
          { id: "it-head-approval", type: "approval", position: { x: 80, y: 420 },
            data: { label: "IT Head Approval", strategy: "department_head",
              requireAll: false, allowReturn: false, slaDays: 2 } },
          { id: "it-provision", type: "approval", position: { x: 420, y: 420 },
            data: { label: "IT Provisioning", strategy: "designation_in_dept",
              designation: "IT Support Engineer", departmentId: itDept.id,
              requireAll: false, allowReturn: false, slaDays: 3 } },
          { id: "end-approved", type: "end-approved", position: { x: 250, y: 560 }, data: { label: "Access Granted" } },
          { id: "end-rejected", type: "end-rejected", position: { x: 480, y: 560 }, data: { label: "Rejected" } },
        ],
        edges: [
          { id: "e1", source: "start",            target: "manager-approval" },
          { id: "e2", source: "manager-approval", target: "access-branch" },
          { id: "e3", source: "access-branch",    target: "it-head-approval", sourceHandle: "admin" },
          { id: "e4", source: "access-branch",    target: "it-provision",     sourceHandle: "normal" },
          { id: "e5", source: "it-head-approval", target: "it-provision" },
          { id: "e6", source: "it-provision",     target: "end-approved" },
        ],
      },
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // HR DEPARTMENT FORMS
  // ══════════════════════════════════════════════════════════════════════════
  if (hrDept && hrAdmin) {
    console.log("\n  📁 HR Department forms:");

    // ── 6. Leave Application ──────────────────────────────────────────────
    await createPublishedForm({
      title: "Leave Application",
      description: "Apply for planned or emergency leave. Routed through manager then HR for record.",
      departmentId: hrDept.id,
      createdById: hrAdmin.id,
      schemaJson: {
        version: 1,
        pages: [{
          title: "Leave Request",
          fields: [
            { key: "leave_type", type: "dropdown", label: "Leave Type", required: true, width: "half",
              options: ["Casual Leave", "Sick Leave", "Earned / Privilege Leave",
                        "Maternity Leave", "Paternity Leave", "Compensatory Off",
                        "Leave Without Pay", "Emergency Leave"],
              visibleIf: null, stepEditable: null },
            { key: "from_date", type: "date", label: "From Date", required: true, width: "half",
              visibleIf: null, stepEditable: null },
            { key: "to_date", type: "date", label: "To Date", required: true, width: "half",
              visibleIf: null, stepEditable: null },
            { key: "half_day", type: "yes-no", label: "Half Day?", required: true, width: "half",
              visibleIf: null, stepEditable: null },
            { key: "reason", type: "textarea", label: "Reason", required: true, width: "full",
              placeholder: "Reason for leave...", visibleIf: null, stepEditable: null },
            { key: "medical_doc", type: "file-upload", label: "Medical Certificate (if Sick Leave)", required: false, width: "full",
              fileConfig: { accept: ["image/*", "application/pdf"], maxSizeMb: 5, multiple: false },
              visibleIf: { logic: "AND", rules: [{ fieldKey: "leave_type", operator: "==", value: "Sick Leave" }] },
              stepEditable: null },
            { key: "handover_notes", type: "textarea", label: "Handover Notes", required: false, width: "full",
              placeholder: "Who covers your responsibilities? Any pending items?",
              visibleIf: null, stepEditable: null },
            { key: "hr_remarks", type: "textarea", label: "HR Remarks", required: false,
              adminOnly: true, stepEditable: "hr-record", width: "full", visibleIf: null },
          ],
        }],
      },
      workflowJson: {
        version: 1,
        nodes: [
          { id: "start", type: "start", position: { x: 250, y: 50 }, data: { label: "Start" } },
          { id: "leave-type-branch", type: "condition", position: { x: 250, y: 160 },
            data: { label: "Long Leave?",
              branches: [
                { id: "long",   label: "Maternity / Paternity / LWP", targetNodeId: "hr-dept-head",    rules: [
                    { fieldKey: "leave_type", operator: "==", value: "Maternity Leave" },
                    { fieldKey: "leave_type", operator: "==", value: "Paternity Leave" },
                    { fieldKey: "leave_type", operator: "==", value: "Leave Without Pay" },
                  ], logic: "OR" },
                { id: "normal", label: "Regular Leave",               targetNodeId: "manager-approval", rules: [], logic: "AND" },
              ] } },
          { id: "manager-approval", type: "approval", position: { x: 420, y: 290 },
            data: { label: "Manager Approval", strategy: "manager_of_submitter",
              requireAll: false, allowReturn: true, slaDays: 1 } },
          { id: "hr-dept-head", type: "approval", position: { x: 80, y: 290 },
            data: { label: "HR Head Approval", strategy: "department_head",
              requireAll: false, allowReturn: true, slaDays: 3 } },
          { id: "hr-record", type: "approval", position: { x: 250, y: 430 },
            data: { label: "HR Record Update", strategy: "department_head",
              requireAll: false, allowReturn: false, slaDays: 2 } },
          { id: "end-approved", type: "end-approved", position: { x: 250, y: 560 }, data: { label: "Approved" } },
          { id: "end-rejected", type: "end-rejected", position: { x: 460, y: 560 }, data: { label: "Rejected" } },
        ],
        edges: [
          { id: "e1", source: "start",           target: "leave-type-branch" },
          { id: "e2", source: "leave-type-branch", target: "hr-dept-head",    sourceHandle: "long" },
          { id: "e3", source: "leave-type-branch", target: "manager-approval", sourceHandle: "normal" },
          { id: "e4", source: "manager-approval", target: "hr-record" },
          { id: "e5", source: "hr-dept-head",     target: "hr-record" },
          { id: "e6", source: "hr-record",        target: "end-approved" },
        ],
      },
    });

    // ── 7. Salary Advance Request ─────────────────────────────────────────
    await createPublishedForm({
      title: "Salary Advance Request",
      description: "Request an advance on your salary for urgent personal financial needs.",
      departmentId: hrDept.id,
      createdById: hrAdmin.id,
      schemaJson: {
        version: 1,
        pages: [{
          title: "Advance Details",
          fields: [
            { key: "amount_requested", type: "number", label: "Amount Requested (₹)", required: true, width: "half",
              validation: { min: 1000, max: 200000 }, visibleIf: null, stepEditable: null },
            { key: "repayment_months", type: "dropdown", label: "Repayment Period", required: true, width: "half",
              options: ["1 Month", "2 Months", "3 Months", "6 Months"],
              visibleIf: null, stepEditable: null },
            { key: "reason", type: "textarea", label: "Reason / Purpose", required: true, width: "full",
              placeholder: "Explain the reason for this advance request...",
              visibleIf: null, stepEditable: null },
            { key: "supporting_doc", type: "file-upload", label: "Supporting Document (optional)", required: false, width: "full",
              fileConfig: { accept: ["image/*", "application/pdf"], maxSizeMb: 5, multiple: false },
              visibleIf: null, stepEditable: null },
            { key: "previous_advance", type: "yes-no", label: "Any Outstanding Previous Advance?", required: true, width: "half",
              visibleIf: null, stepEditable: null },
            { key: "previous_balance", type: "number", label: "Outstanding Balance (₹)", required: false, width: "half",
              visibleIf: { logic: "AND", rules: [{ fieldKey: "previous_advance", operator: "==", value: "true" }] },
              stepEditable: null },
            { key: "hr_approval_notes", type: "textarea", label: "HR Notes", required: false,
              adminOnly: true, stepEditable: "hr-approve", width: "full", visibleIf: null },
            { key: "finance_notes", type: "textarea", label: "Finance Notes", required: false,
              adminOnly: true, stepEditable: "finance-approve", width: "full", visibleIf: null },
          ],
        }],
      },
      workflowJson: {
        version: 1,
        nodes: [
          { id: "start", type: "start", position: { x: 250, y: 50 }, data: { label: "Start" } },
          { id: "manager-approval", type: "approval", position: { x: 250, y: 160 },
            data: { label: "Manager Approval", strategy: "manager_of_submitter",
              requireAll: false, allowReturn: true, slaDays: 2 } },
          { id: "hr-approve", type: "approval", position: { x: 250, y: 290 },
            data: { label: "HR Approval", strategy: "department_head",
              requireAll: false, allowReturn: true, slaDays: 2 } },
          { id: "amount-branch", type: "condition", position: { x: 250, y: 420 },
            data: { label: "Amount > ₹50,000?",
              branches: [
                { id: "high",   label: "> ₹50,000", targetNodeId: "finance-approve", rules: [{ fieldKey: "amount_requested", operator: ">", value: "50000" }], logic: "AND" },
                { id: "normal", label: "≤ ₹50,000", targetNodeId: "end-approved",   rules: [], logic: "AND" },
              ] } },
          { id: "finance-approve", type: "approval", position: { x: 80, y: 550 },
            data: { label: "Finance Head Approval", strategy: "designation_in_dept",
              designation: "Finance Head", departmentId: hrDept.id,
              requireAll: false, allowReturn: false, slaDays: 3 } },
          { id: "end-approved", type: "end-approved", position: { x: 310, y: 680 }, data: { label: "Approved" } },
          { id: "end-rejected", type: "end-rejected", position: { x: 500, y: 550 }, data: { label: "Rejected" } },
        ],
        edges: [
          { id: "e1", source: "start",            target: "manager-approval" },
          { id: "e2", source: "manager-approval", target: "hr-approve" },
          { id: "e3", source: "hr-approve",       target: "amount-branch" },
          { id: "e4", source: "amount-branch",    target: "finance-approve", sourceHandle: "high" },
          { id: "e5", source: "amount-branch",    target: "end-approved",    sourceHandle: "normal" },
          { id: "e6", source: "finance-approve",  target: "end-approved" },
        ],
      },
    });

    // ── 8. Training & Development Request ─────────────────────────────────
    await createPublishedForm({
      title: "Training & Development Request",
      description: "Request to attend internal or external training programs, certifications, or workshops.",
      departmentId: hrDept.id,
      createdById: hrAdmin.id,
      schemaJson: {
        version: 1,
        pages: [{
          title: "Training Details",
          fields: [
            { key: "training_type", type: "radio", label: "Training Type", required: true, width: "half",
              options: ["Internal (In-house)", "External (Off-site)", "Online / E-Learning", "Certification Exam"],
              visibleIf: null, stepEditable: null },
            { key: "training_name", type: "text", label: "Training / Course Name", required: true, width: "half",
              placeholder: "e.g. AWS Solutions Architect", visibleIf: null, stepEditable: null },
            { key: "provider", type: "text", label: "Training Provider / Institute", required: false, width: "half",
              placeholder: "e.g. Udemy, Coursera, NIIT", visibleIf: null, stepEditable: null },
            { key: "training_dates", type: "text", label: "Training Dates", required: true, width: "half",
              placeholder: "e.g. 15–17 July 2026", visibleIf: null, stepEditable: null },
            { key: "training_location", type: "text", label: "Location / Platform URL", required: false, width: "half",
              placeholder: "e.g. Mumbai / udemy.com/course/...",
              visibleIf: null, stepEditable: null },
            { key: "cost", type: "number", label: "Estimated Cost (₹)", required: true, width: "half",
              validation: { min: 0 }, visibleIf: null, stepEditable: null },
            { key: "objective", type: "textarea", label: "Learning Objective", required: true, width: "full",
              placeholder: "How will this training benefit your work and the organisation?",
              visibleIf: null, stepEditable: null },
            { key: "brochure", type: "file-upload", label: "Course Brochure / Details", required: false, width: "full",
              fileConfig: { accept: ["application/pdf", "image/*"], maxSizeMb: 5, multiple: false },
              visibleIf: null, stepEditable: null },
            { key: "hr_comments", type: "textarea", label: "HR Comments", required: false,
              adminOnly: true, stepEditable: "hr-review", width: "full", visibleIf: null },
          ],
        }],
      },
      workflowJson: {
        version: 1,
        nodes: [
          { id: "start", type: "start", position: { x: 250, y: 50 }, data: { label: "Start" } },
          { id: "manager-approval", type: "approval", position: { x: 250, y: 160 },
            data: { label: "Manager Approval", strategy: "manager_of_submitter",
              requireAll: false, allowReturn: true, slaDays: 3 } },
          { id: "cost-branch", type: "condition", position: { x: 250, y: 290 },
            data: { label: "Cost > ₹25,000?",
              branches: [
                { id: "costly",   label: "Cost > ₹25,000", targetNodeId: "dept-head-approval", rules: [{ fieldKey: "cost", operator: ">", value: "25000" }], logic: "AND" },
                { id: "low-cost", label: "Cost ≤ ₹25,000", targetNodeId: "hr-review",          rules: [], logic: "AND" },
              ] } },
          { id: "hr-review", type: "approval", position: { x: 420, y: 420 },
            data: { label: "HR Review", strategy: "department_head",
              requireAll: false, allowReturn: false, slaDays: 3 } },
          { id: "dept-head-approval", type: "approval", position: { x: 80, y: 420 },
            data: { label: "Dept Head + HR Approval", strategy: "department_head",
              requireAll: false, allowReturn: false, slaDays: 3 } },
          { id: "end-approved", type: "end-approved", position: { x: 250, y: 560 }, data: { label: "Approved" } },
          { id: "end-rejected", type: "end-rejected", position: { x: 460, y: 420 }, data: { label: "Rejected" } },
        ],
        edges: [
          { id: "e1", source: "start",            target: "manager-approval" },
          { id: "e2", source: "manager-approval", target: "cost-branch" },
          { id: "e3", source: "cost-branch",      target: "dept-head-approval", sourceHandle: "costly" },
          { id: "e4", source: "cost-branch",      target: "hr-review",          sourceHandle: "low-cost" },
          { id: "e5", source: "dept-head-approval", target: "hr-review" },
          { id: "e6", source: "hr-review",        target: "end-approved" },
        ],
      },
    });

    // ── 9. Employee Transfer / Deputation Request ─────────────────────────
    await createPublishedForm({
      title: "Employee Transfer / Deputation Request",
      description: "Request for inter-department or inter-company transfer or short-term deputation.",
      departmentId: hrDept.id,
      createdById: hrAdmin.id,
      schemaJson: {
        version: 1,
        pages: [{
          title: "Transfer Details",
          fields: [
            { key: "request_type", type: "radio", label: "Request Type", required: true, width: "half",
              options: ["Permanent Transfer", "Temporary Deputation"],
              visibleIf: null, stepEditable: null },
            { key: "current_dept", type: "auto-dept", label: "Current Department", required: false, width: "half",
              visibleIf: null, stepEditable: null },
            { key: "target_company", type: "dropdown", label: "Target Company", required: true, width: "half",
              options: ["Acme Industries Ltd.", "Globex Holdings Ltd."],
              visibleIf: null, stepEditable: null },
            { key: "target_dept", type: "text", label: "Target Department", required: true, width: "half",
              placeholder: "e.g. Finance", visibleIf: null, stepEditable: null },
            { key: "effective_date", type: "date", label: "Effective Date", required: true, width: "half",
              visibleIf: null, stepEditable: null },
            { key: "deputation_end_date", type: "date", label: "Deputation End Date", required: false, width: "half",
              visibleIf: { logic: "AND", rules: [{ fieldKey: "request_type", operator: "==", value: "Temporary Deputation" }] },
              stepEditable: null },
            { key: "reason", type: "textarea", label: "Reason / Justification", required: true, width: "full",
              placeholder: "Reason for transfer/deputation request...",
              visibleIf: null, stepEditable: null },
            { key: "hr_remarks", type: "textarea", label: "HR Remarks", required: false,
              adminOnly: true, stepEditable: "hr-process", width: "full", visibleIf: null },
          ],
        }],
      },
      workflowJson: {
        version: 1,
        nodes: [
          { id: "start", type: "start", position: { x: 250, y: 50 }, data: { label: "Start" } },
          { id: "current-manager", type: "approval", position: { x: 250, y: 160 },
            data: { label: "Current Manager Approval", strategy: "manager_of_submitter",
              requireAll: false, allowReturn: true, slaDays: 3 } },
          { id: "hr-process", type: "approval", position: { x: 250, y: 290 },
            data: { label: "HR Head Review", strategy: "department_head",
              requireAll: false, allowReturn: true, slaDays: 5 } },
          { id: "end-approved", type: "end-approved", position: { x: 250, y: 420 }, data: { label: "Approved" } },
          { id: "end-rejected", type: "end-rejected", position: { x: 450, y: 420 }, data: { label: "Rejected" } },
        ],
        edges: [
          { id: "e1", source: "start",           target: "current-manager" },
          { id: "e2", source: "current-manager", target: "hr-process" },
          { id: "e3", source: "hr-process",      target: "end-approved" },
        ],
      },
    });

    // ── 10. Travel & Expense Claim ─────────────────────────────────────────
    await createPublishedForm({
      title: "Travel & Expense Claim",
      description: "Claim reimbursement for official travel expenses including lodging, meals, and transport.",
      departmentId: hrDept.id,
      createdById: hrAdmin.id,
      schemaJson: {
        version: 1,
        pages: [
          {
            title: "Travel Information",
            fields: [
              { key: "travel_purpose", type: "text", label: "Purpose of Travel", required: true, width: "full",
                placeholder: "e.g. Client visit, Training, Conference", visibleIf: null, stepEditable: null },
              { key: "travel_from", type: "text", label: "Departure Location", required: true, width: "half",
                placeholder: "e.g. Ahmedabad", visibleIf: null, stepEditable: null },
              { key: "travel_to", type: "text", label: "Destination", required: true, width: "half",
                placeholder: "e.g. Mumbai", visibleIf: null, stepEditable: null },
              { key: "departure_date", type: "date", label: "Departure Date", required: true, width: "half",
                visibleIf: null, stepEditable: null },
              { key: "return_date", type: "date", label: "Return Date", required: true, width: "half",
                visibleIf: null, stepEditable: null },
            ],
          },
          {
            title: "Expense Breakdown",
            fields: [
              { key: "transport_cost", type: "number", label: "Transport Cost (₹)", required: false, width: "third",
                validation: { min: 0 }, visibleIf: null, stepEditable: null },
              { key: "accommodation_cost", type: "number", label: "Accommodation Cost (₹)", required: false, width: "third",
                validation: { min: 0 }, visibleIf: null, stepEditable: null },
              { key: "meals_cost", type: "number", label: "Meals & Incidentals (₹)", required: false, width: "third",
                validation: { min: 0 }, visibleIf: null, stepEditable: null },
              { key: "other_cost", type: "number", label: "Other Expenses (₹)", required: false, width: "half",
                validation: { min: 0 }, visibleIf: null, stepEditable: null },
              { key: "total_amount", type: "number", label: "Total Claim Amount (₹)", required: true, width: "half",
                validation: { min: 1 }, visibleIf: null, stepEditable: null },
              { key: "advance_taken", type: "number", label: "Travel Advance Already Taken (₹)", required: false, width: "half",
                validation: { min: 0 }, visibleIf: null, stepEditable: null },
              { key: "receipts", type: "file-upload", label: "Receipts / Bills", required: true, width: "full",
                fileConfig: { accept: ["image/*", "application/pdf"], maxSizeMb: 10, multiple: true },
                visibleIf: null, stepEditable: null },
              { key: "finance_notes", type: "textarea", label: "Finance Notes", required: false,
                adminOnly: true, stepEditable: "finance-verify", width: "full", visibleIf: null },
            ],
          },
        ],
      },
      workflowJson: {
        version: 1,
        nodes: [
          { id: "start", type: "start", position: { x: 250, y: 50 }, data: { label: "Start" } },
          { id: "manager-approval", type: "approval", position: { x: 250, y: 160 },
            data: { label: "Manager Approval", strategy: "manager_of_submitter",
              requireAll: false, allowReturn: true, slaDays: 3 } },
          { id: "amount-branch", type: "condition", position: { x: 250, y: 290 },
            data: { label: "Amount > ₹30,000?",
              branches: [
                { id: "high",   label: "> ₹30,000", targetNodeId: "dept-head",      rules: [{ fieldKey: "total_amount", operator: ">", value: "30000" }], logic: "AND" },
                { id: "normal", label: "≤ ₹30,000", targetNodeId: "finance-verify", rules: [], logic: "AND" },
              ] } },
          { id: "dept-head", type: "approval", position: { x: 80, y: 420 },
            data: { label: "Dept Head Approval", strategy: "department_head",
              requireAll: false, allowReturn: false, slaDays: 3 } },
          { id: "finance-verify", type: "approval", position: { x: 420, y: 420 },
            data: { label: "Finance Verification", strategy: "designation_in_dept",
              designation: "Finance Executive", departmentId: hrDept.id,
              requireAll: false, allowReturn: true, slaDays: 3 } },
          { id: "end-approved", type: "end-approved", position: { x: 250, y: 560 }, data: { label: "Claim Approved" } },
          { id: "end-rejected", type: "end-rejected", position: { x: 480, y: 560 }, data: { label: "Rejected" } },
        ],
        edges: [
          { id: "e1", source: "start",            target: "manager-approval" },
          { id: "e2", source: "manager-approval", target: "amount-branch" },
          { id: "e3", source: "amount-branch",    target: "dept-head",       sourceHandle: "high" },
          { id: "e4", source: "amount-branch",    target: "finance-verify",  sourceHandle: "normal" },
          { id: "e5", source: "dept-head",        target: "finance-verify" },
          { id: "e6", source: "finance-verify",   target: "end-approved" },
        ],
      },
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // FINANCE DEPARTMENT FORMS
  // ══════════════════════════════════════════════════════════════════════════
  if (finDept && finAdmin) {
    console.log("\n  📁 Finance Department forms:");

    // ── 11. Purchase Order Request ─────────────────────────────────────────
    await createPublishedForm({
      title: "Purchase Order Request",
      description: "Request approval to procure goods or services from an external vendor.",
      departmentId: finDept.id,
      createdById: finAdmin.id,
      schemaJson: {
        version: 1,
        pages: [
          {
            title: "Vendor & Item Details",
            fields: [
              { key: "vendor_name", type: "text", label: "Vendor / Supplier Name", required: true, width: "half",
                placeholder: "e.g. Tech Supplies Pvt. Ltd.", visibleIf: null, stepEditable: null },
              { key: "vendor_gstin", type: "text", label: "Vendor GSTIN", required: false, width: "half",
                placeholder: "e.g. 27AAPFU0939F1ZV", visibleIf: null, stepEditable: null },
              { key: "items", type: "table-grid", label: "Item List", required: true, width: "full",
                tableConfig: {
                  columns: [
                    { key: "description", label: "Item Description", type: "text" },
                    { key: "qty",         label: "Qty",              type: "number" },
                    { key: "unit",        label: "Unit",             type: "text" },
                    { key: "unit_price",  label: "Unit Price (₹)",   type: "number" },
                  ],
                },
                visibleIf: null, stepEditable: null },
              { key: "total_amount", type: "number", label: "Total Estimated Amount (₹)", required: true, width: "half",
                validation: { min: 1 }, visibleIf: null, stepEditable: null },
              { key: "budget_code", type: "text", label: "Budget Code / Cost Centre", required: false, width: "half",
                placeholder: "e.g. IT-OPS-2026", visibleIf: null, stepEditable: null },
            ],
          },
          {
            title: "Procurement Details",
            fields: [
              { key: "urgency", type: "radio", label: "Procurement Urgency", required: true, width: "half",
                options: ["Routine", "Urgent", "Emergency"], visibleIf: null, stepEditable: null },
              { key: "required_by", type: "date", label: "Required By Date", required: false, width: "half",
                visibleIf: null, stepEditable: null },
              { key: "justification", type: "textarea", label: "Justification / Purpose", required: true, width: "full",
                placeholder: "Why is this purchase needed?", visibleIf: null, stepEditable: null },
              { key: "quote_doc", type: "file-upload", label: "Vendor Quote / Proforma", required: false, width: "full",
                fileConfig: { accept: ["application/pdf", "image/*"], maxSizeMb: 10, multiple: true },
                visibleIf: null, stepEditable: null },
              { key: "finance_po_notes", type: "textarea", label: "Finance / PO Notes", required: false,
                adminOnly: true, stepEditable: "finance-approve", width: "full", visibleIf: null },
            ],
          },
        ],
      },
      workflowJson: {
        version: 1,
        nodes: [
          { id: "start", type: "start", position: { x: 250, y: 50 }, data: { label: "Start" } },
          { id: "manager-approval", type: "approval", position: { x: 250, y: 160 },
            data: { label: "Requesting Manager", strategy: "manager_of_submitter",
              requireAll: false, allowReturn: true, slaDays: 3 } },
          { id: "amount-branch", type: "condition", position: { x: 250, y: 290 },
            data: { label: "Amount Tier",
              branches: [
                { id: "high", label: "> ₹1,00,000", targetNodeId: "gm-approval",    rules: [{ fieldKey: "total_amount", operator: ">", value: "100000" }], logic: "AND" },
                { id: "mid",  label: "₹25k – ₹1L",  targetNodeId: "finance-head",   rules: [{ fieldKey: "total_amount", operator: ">", value: "25000"  }], logic: "AND" },
                { id: "low",  label: "≤ ₹25,000",   targetNodeId: "finance-approve", rules: [], logic: "AND" },
              ] } },
          { id: "finance-approve", type: "approval", position: { x: 420, y: 420 },
            data: { label: "Finance Manager", strategy: "department_head",
              requireAll: false, allowReturn: true, slaDays: 3 } },
          { id: "finance-head", type: "approval", position: { x: 250, y: 420 },
            data: { label: "Finance Head Approval", strategy: "department_head",
              requireAll: false, allowReturn: false, slaDays: 3 } },
          { id: "gm-approval", type: "approval", position: { x: 80, y: 420 },
            data: { label: "GM / Director Approval", strategy: "designation_in_dept",
              designation: "General Manager", departmentId: finDept.id,
              requireAll: false, allowReturn: false, slaDays: 5 } },
          { id: "end-approved", type: "end-approved", position: { x: 250, y: 580 }, data: { label: "PO Approved" } },
          { id: "end-rejected", type: "end-rejected", position: { x: 500, y: 580 }, data: { label: "Rejected" } },
        ],
        edges: [
          { id: "e1", source: "start",            target: "manager-approval" },
          { id: "e2", source: "manager-approval", target: "amount-branch" },
          { id: "e3", source: "amount-branch",    target: "gm-approval",    sourceHandle: "high" },
          { id: "e4", source: "amount-branch",    target: "finance-head",   sourceHandle: "mid" },
          { id: "e5", source: "amount-branch",    target: "finance-approve", sourceHandle: "low" },
          { id: "e6", source: "gm-approval",      target: "finance-approve" },
          { id: "e7", source: "finance-head",     target: "finance-approve" },
          { id: "e8", source: "finance-approve",  target: "end-approved" },
        ],
      },
    });

    // ── 12. Petty Cash Reimbursement ───────────────────────────────────────
    await createPublishedForm({
      title: "Petty Cash Reimbursement",
      description: "Claim reimbursement for small out-of-pocket business expenses under ₹5,000.",
      departmentId: finDept.id,
      createdById: finAdmin.id,
      schemaJson: {
        version: 1,
        pages: [{
          title: "Expense Details",
          fields: [
            { key: "expense_date", type: "date", label: "Expense Date", required: true, width: "half",
              visibleIf: null, stepEditable: null },
            { key: "expense_category", type: "dropdown", label: "Expense Category", required: true, width: "half",
              options: ["Stationery / Office Supplies", "Courier / Postage", "Taxi / Auto",
                        "Refreshments (Meeting)", "Printing", "Miscellaneous"],
              visibleIf: null, stepEditable: null },
            { key: "description", type: "text", label: "Description", required: true, width: "full",
              placeholder: "Brief description of expense", visibleIf: null, stepEditable: null },
            { key: "amount", type: "number", label: "Amount (₹)", required: true, width: "half",
              validation: { min: 1, max: 5000 }, visibleIf: null, stepEditable: null },
            { key: "paid_by", type: "radio", label: "Paid By", required: true, width: "half",
              options: ["Self (Personal)", "Petty Cash Box"], visibleIf: null, stepEditable: null },
            { key: "receipt", type: "file-upload", label: "Receipt / Bill", required: true, width: "full",
              fileConfig: { accept: ["image/*", "application/pdf"], maxSizeMb: 3, multiple: false },
              visibleIf: null, stepEditable: null },
            { key: "finance_verification", type: "textarea", label: "Finance Verified By", required: false,
              adminOnly: true, stepEditable: "finance-verify", width: "full", visibleIf: null },
          ],
        }],
      },
      workflowJson: {
        version: 1,
        nodes: [
          { id: "start", type: "start", position: { x: 250, y: 50 }, data: { label: "Start" } },
          { id: "manager-approval", type: "approval", position: { x: 250, y: 160 },
            data: { label: "Manager Approval", strategy: "manager_of_submitter",
              requireAll: false, allowReturn: true, slaDays: 1 } },
          { id: "finance-verify", type: "approval", position: { x: 250, y: 290 },
            data: { label: "Finance Verification", strategy: "department_head",
              requireAll: false, allowReturn: true, slaDays: 2 } },
          { id: "end-approved", type: "end-approved", position: { x: 250, y: 420 }, data: { label: "Reimbursed" } },
          { id: "end-rejected", type: "end-rejected", position: { x: 450, y: 420 }, data: { label: "Rejected" } },
        ],
        edges: [
          { id: "e1", source: "start",            target: "manager-approval" },
          { id: "e2", source: "manager-approval", target: "finance-verify" },
          { id: "e3", source: "finance-verify",   target: "end-approved" },
        ],
      },
    });

    // ── 13. Budget Reallocation / Revision Request ─────────────────────────
    await createPublishedForm({
      title: "Budget Reallocation Request",
      description: "Request to move budget allocation between cost centres or revise the approved budget.",
      departmentId: finDept.id,
      createdById: finAdmin.id,
      schemaJson: {
        version: 1,
        pages: [{
          title: "Reallocation Details",
          fields: [
            { key: "from_cost_centre", type: "text", label: "From Cost Centre / Head", required: true, width: "half",
              placeholder: "e.g. IT-CAPEX-2026", visibleIf: null, stepEditable: null },
            { key: "to_cost_centre", type: "text", label: "To Cost Centre / Head", required: true, width: "half",
              placeholder: "e.g. HR-TRAINING-2026", visibleIf: null, stepEditable: null },
            { key: "amount", type: "number", label: "Reallocation Amount (₹)", required: true, width: "half",
              validation: { min: 1 }, visibleIf: null, stepEditable: null },
            { key: "quarter", type: "dropdown", label: "Quarter", required: true, width: "half",
              options: ["Q1 (Apr–Jun)", "Q2 (Jul–Sep)", "Q3 (Oct–Dec)", "Q4 (Jan–Mar)"],
              visibleIf: null, stepEditable: null },
            { key: "reason", type: "textarea", label: "Reason for Reallocation", required: true, width: "full",
              placeholder: "Explain the business need...", visibleIf: null, stepEditable: null },
            { key: "supporting_doc", type: "file-upload", label: "Supporting Document", required: false, width: "full",
              fileConfig: { accept: ["application/pdf", "image/*"], maxSizeMb: 5, multiple: true },
              visibleIf: null, stepEditable: null },
            { key: "finance_head_notes", type: "textarea", label: "Finance Head Notes", required: false,
              adminOnly: true, stepEditable: "finance-head-approve", width: "full", visibleIf: null },
          ],
        }],
      },
      workflowJson: {
        version: 1,
        nodes: [
          { id: "start", type: "start", position: { x: 250, y: 50 }, data: { label: "Start" } },
          { id: "dept-head", type: "approval", position: { x: 250, y: 160 },
            data: { label: "Department Head Approval", strategy: "department_head",
              requireAll: false, allowReturn: true, slaDays: 3 } },
          { id: "finance-head-approve", type: "approval", position: { x: 250, y: 290 },
            data: { label: "Finance Head Approval", strategy: "department_head",
              requireAll: false, allowReturn: true, slaDays: 3 } },
          { id: "amount-branch", type: "condition", position: { x: 250, y: 420 },
            data: { label: "Amount > ₹5 Lakh?",
              branches: [
                { id: "large",  label: "> ₹5,00,000", targetNodeId: "gm-approve",   rules: [{ fieldKey: "amount", operator: ">", value: "500000" }], logic: "AND" },
                { id: "normal", label: "≤ ₹5,00,000", targetNodeId: "end-approved", rules: [], logic: "AND" },
              ] } },
          { id: "gm-approve", type: "approval", position: { x: 80, y: 550 },
            data: { label: "GM / Director Approval", strategy: "designation_in_dept",
              designation: "General Manager", departmentId: finDept.id,
              requireAll: false, allowReturn: false, slaDays: 5 } },
          { id: "end-approved", type: "end-approved", position: { x: 310, y: 680 }, data: { label: "Approved" } },
          { id: "end-rejected", type: "end-rejected", position: { x: 500, y: 550 }, data: { label: "Rejected" } },
        ],
        edges: [
          { id: "e1", source: "start",                   target: "dept-head" },
          { id: "e2", source: "dept-head",               target: "finance-head-approve" },
          { id: "e3", source: "finance-head-approve",    target: "amount-branch" },
          { id: "e4", source: "amount-branch",           target: "gm-approve",    sourceHandle: "large" },
          { id: "e5", source: "amount-branch",           target: "end-approved",  sourceHandle: "normal" },
          { id: "e6", source: "gm-approve",              target: "end-approved" },
        ],
      },
    });

    // ── 14. Vendor Payment Approval ────────────────────────────────────────
    await createPublishedForm({
      title: "Vendor Payment Approval",
      description: "Approve payment to vendor against an approved PO or service agreement.",
      departmentId: finDept.id,
      createdById: finAdmin.id,
      schemaJson: {
        version: 1,
        pages: [{
          title: "Payment Details",
          fields: [
            { key: "vendor_name", type: "text", label: "Vendor Name", required: true, width: "half",
              visibleIf: null, stepEditable: null },
            { key: "invoice_no", type: "text", label: "Invoice Number", required: true, width: "half",
              placeholder: "e.g. INV-2026-00123", visibleIf: null, stepEditable: null },
            { key: "invoice_date", type: "date", label: "Invoice Date", required: true, width: "half",
              visibleIf: null, stepEditable: null },
            { key: "po_reference", type: "text", label: "PO / Contract Reference", required: false, width: "half",
              placeholder: "e.g. PO-ACME-00567", visibleIf: null, stepEditable: null },
            { key: "amount", type: "number", label: "Invoice Amount (₹)", required: true, width: "half",
              validation: { min: 1 }, visibleIf: null, stepEditable: null },
            { key: "gst_amount", type: "number", label: "GST Amount (₹)", required: false, width: "half",
              validation: { min: 0 }, visibleIf: null, stepEditable: null },
            { key: "payment_mode", type: "radio", label: "Payment Mode", required: true, width: "half",
              options: ["NEFT / RTGS", "Cheque", "Demand Draft"],
              visibleIf: null, stepEditable: null },
            { key: "bank_details", type: "textarea", label: "Vendor Bank Details", required: false, width: "full",
              placeholder: "Bank Name, Account No, IFSC Code (if not already on record)",
              visibleIf: null, stepEditable: null },
            { key: "invoice_attachment", type: "file-upload", label: "Invoice Copy", required: true, width: "full",
              fileConfig: { accept: ["application/pdf", "image/*"], maxSizeMb: 10, multiple: false },
              visibleIf: null, stepEditable: null },
            { key: "finance_processing_notes", type: "textarea", label: "Finance Processing Notes", required: false,
              adminOnly: true, stepEditable: "finance-process", width: "full", visibleIf: null },
          ],
        }],
      },
      workflowJson: {
        version: 1,
        nodes: [
          { id: "start", type: "start", position: { x: 250, y: 50 }, data: { label: "Start" } },
          { id: "finance-verify", type: "approval", position: { x: 250, y: 160 },
            data: { label: "Finance Verification", strategy: "department_head",
              requireAll: false, allowReturn: true, slaDays: 2 } },
          { id: "amount-branch", type: "condition", position: { x: 250, y: 290 },
            data: { label: "Amount Threshold",
              branches: [
                { id: "high",   label: "> ₹2,00,000", targetNodeId: "gm-approve",      rules: [{ fieldKey: "amount", operator: ">", value: "200000" }], logic: "AND" },
                { id: "normal", label: "≤ ₹2,00,000", targetNodeId: "finance-process", rules: [], logic: "AND" },
              ] } },
          { id: "gm-approve", type: "approval", position: { x: 80, y: 420 },
            data: { label: "GM Approval", strategy: "designation_in_dept",
              designation: "General Manager", departmentId: finDept.id,
              requireAll: false, allowReturn: false, slaDays: 3 } },
          { id: "finance-process", type: "approval", position: { x: 420, y: 420 },
            data: { label: "Finance Processing", strategy: "department_head",
              requireAll: false, allowReturn: false, slaDays: 2 } },
          { id: "end-approved", type: "end-approved", position: { x: 250, y: 560 }, data: { label: "Payment Released" } },
          { id: "end-rejected", type: "end-rejected", position: { x: 480, y: 560 }, data: { label: "Rejected" } },
        ],
        edges: [
          { id: "e1", source: "start",           target: "finance-verify" },
          { id: "e2", source: "finance-verify",  target: "amount-branch" },
          { id: "e3", source: "amount-branch",   target: "gm-approve",      sourceHandle: "high" },
          { id: "e4", source: "amount-branch",   target: "finance-process", sourceHandle: "normal" },
          { id: "e5", source: "gm-approve",      target: "finance-process" },
          { id: "e6", source: "finance-process", target: "end-approved" },
        ],
      },
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ADMIN DEPARTMENT FORMS
  // ══════════════════════════════════════════════════════════════════════════
  if (adminDept && adminUser) {
    console.log("\n  📁 Administration Department forms:");

    // ── 15. Office Supply Request ──────────────────────────────────────────
    await createPublishedForm({
      title: "Office Supply Request",
      description: "Request stationery, consumables, or general office supplies for your department.",
      departmentId: adminDept.id,
      createdById: adminUser.id,
      schemaJson: {
        version: 1,
        pages: [{
          title: "Supply Request",
          fields: [
            { key: "items", type: "table-grid", label: "Items Required", required: true, width: "full",
              tableConfig: {
                columns: [
                  { key: "item_name",   label: "Item Name",     type: "text" },
                  { key: "qty",         label: "Quantity",      type: "number" },
                  { key: "unit",        label: "Unit (pcs/box/ream)", type: "text" },
                  { key: "remarks",     label: "Remarks",       type: "text" },
                ],
              },
              visibleIf: null, stepEditable: null },
            { key: "urgency", type: "radio", label: "Urgency", required: true, width: "half",
              options: ["Routine", "Urgent"], visibleIf: null, stepEditable: null },
            { key: "required_by", type: "date", label: "Required By", required: false, width: "half",
              visibleIf: null, stepEditable: null },
            { key: "remarks", type: "textarea", label: "Additional Remarks", required: false, width: "full",
              placeholder: "Any specific brand or specification requirements?",
              visibleIf: null, stepEditable: null },
            { key: "admin_notes", type: "textarea", label: "Admin Processing Notes", required: false,
              adminOnly: true, stepEditable: "admin-process", width: "full", visibleIf: null },
          ],
        }],
      },
      workflowJson: {
        version: 1,
        nodes: [
          { id: "start", type: "start", position: { x: 250, y: 50 }, data: { label: "Start" } },
          { id: "manager-approval", type: "approval", position: { x: 250, y: 160 },
            data: { label: "Manager Approval", strategy: "manager_of_submitter",
              requireAll: false, allowReturn: true, slaDays: 2 } },
          { id: "admin-process", type: "approval", position: { x: 250, y: 290 },
            data: { label: "Admin Processing", strategy: "department_head",
              requireAll: false, allowReturn: false, slaDays: 3 } },
          { id: "end-approved", type: "end-approved", position: { x: 250, y: 420 }, data: { label: "Dispatched" } },
          { id: "end-rejected", type: "end-rejected", position: { x: 450, y: 420 }, data: { label: "Rejected" } },
        ],
        edges: [
          { id: "e1", source: "start",            target: "manager-approval" },
          { id: "e2", source: "manager-approval", target: "admin-process" },
          { id: "e3", source: "admin-process",    target: "end-approved" },
        ],
      },
    });

    // ── 16. Visitor Pass Request ───────────────────────────────────────────
    await createPublishedForm({
      title: "Visitor Pass Request",
      description: "Request a visitor entry pass for guests, vendors, or contractors visiting the premises.",
      departmentId: adminDept.id,
      createdById: adminUser.id,
      schemaJson: {
        version: 1,
        pages: [{
          title: "Visitor Details",
          fields: [
            { key: "visitor_name", type: "text", label: "Visitor Name", required: true, width: "half",
              placeholder: "Full name of visitor", visibleIf: null, stepEditable: null },
            { key: "visitor_company", type: "text", label: "Visitor's Organization", required: false, width: "half",
              placeholder: "Company / Firm name", visibleIf: null, stepEditable: null },
            { key: "visitor_phone", type: "phone", label: "Visitor's Mobile Number", required: true, width: "half",
              visibleIf: null, stepEditable: null },
            { key: "visitor_id_type", type: "dropdown", label: "Visitor ID Type", required: true, width: "half",
              options: ["Aadhaar Card", "PAN Card", "Passport", "Driving Licence", "Employee ID (other org)"],
              visibleIf: null, stepEditable: null },
            { key: "visit_date", type: "date", label: "Visit Date", required: true, width: "half",
              visibleIf: null, stepEditable: null },
            { key: "visit_time", type: "time", label: "Expected Arrival Time", required: false, width: "half",
              visibleIf: null, stepEditable: null },
            { key: "visit_purpose", type: "dropdown", label: "Purpose of Visit", required: true, width: "half",
              options: ["Business Meeting", "Vendor / Delivery", "Interview / Recruitment",
                        "Audit / Inspection", "IT Support", "Personal", "Other"],
              visibleIf: null, stepEditable: null },
            { key: "meeting_with", type: "text", label: "Meeting With (Employee Name)", required: true, width: "half",
              placeholder: "Name of employee being visited", visibleIf: null, stepEditable: null },
            { key: "areas_to_access", type: "checkbox-group", label: "Areas to Access", required: true, width: "full",
              options: ["Reception / Lobby", "Conference Room", "IT Department", "HR Department",
                        "Finance Department", "Server Room (special approval)", "Production Area"],
              visibleIf: null, stepEditable: null },
            { key: "laptop_allowed", type: "yes-no", label: "Laptop / Device Allowed?", required: true, width: "half",
              visibleIf: null, stepEditable: null },
            { key: "admin_pass_notes", type: "textarea", label: "Security / Admin Notes", required: false,
              adminOnly: true, stepEditable: "admin-issue", width: "full", visibleIf: null },
          ],
        }],
      },
      workflowJson: {
        version: 1,
        nodes: [
          { id: "start", type: "start", position: { x: 250, y: 50 }, data: { label: "Start" } },
          { id: "area-branch", type: "condition", position: { x: 250, y: 160 },
            data: { label: "Sensitive Area?",
              branches: [
                { id: "sensitive", label: "Server Room Access", targetNodeId: "it-security", rules: [{ fieldKey: "areas_to_access", operator: "contains", value: "Server Room (special approval)" }], logic: "AND" },
                { id: "normal",    label: "Standard Areas",     targetNodeId: "admin-issue", rules: [], logic: "AND" },
              ] } },
          { id: "it-security", type: "approval", position: { x: 80, y: 290 },
            data: { label: "IT Security Approval", strategy: "department_head",
              requireAll: false, allowReturn: false, slaDays: 1 } },
          { id: "admin-issue", type: "approval", position: { x: 420, y: 290 },
            data: { label: "Admin Pass Issuance", strategy: "department_head",
              requireAll: false, allowReturn: false, slaDays: 1 } },
          { id: "end-approved", type: "end-approved", position: { x: 250, y: 420 }, data: { label: "Pass Issued" } },
          { id: "end-rejected", type: "end-rejected", position: { x: 480, y: 420 }, data: { label: "Rejected" } },
        ],
        edges: [
          { id: "e1", source: "start",        target: "area-branch" },
          { id: "e2", source: "area-branch",  target: "it-security", sourceHandle: "sensitive" },
          { id: "e3", source: "area-branch",  target: "admin-issue", sourceHandle: "normal" },
          { id: "e4", source: "it-security",  target: "admin-issue" },
          { id: "e5", source: "admin-issue",  target: "end-approved" },
        ],
      },
    });

    // ── 17. Vehicle / Transport Request ───────────────────────────────────
    await createPublishedForm({
      title: "Vehicle / Transport Request",
      description: "Request company vehicle or transport arrangement for official travel.",
      departmentId: adminDept.id,
      createdById: adminUser.id,
      schemaJson: {
        version: 1,
        pages: [{
          title: "Transport Details",
          fields: [
            { key: "travel_date", type: "date", label: "Travel Date", required: true, width: "half",
              visibleIf: null, stepEditable: null },
            { key: "departure_time", type: "time", label: "Departure Time", required: true, width: "half",
              visibleIf: null, stepEditable: null },
            { key: "from_location", type: "text", label: "From (Pickup Location)", required: true, width: "half",
              placeholder: "e.g. Office, ACME HQ", visibleIf: null, stepEditable: null },
            { key: "to_location", type: "text", label: "To (Drop Location)", required: true, width: "half",
              placeholder: "e.g. Airport, Client Site", visibleIf: null, stepEditable: null },
            { key: "return_required", type: "yes-no", label: "Return Trip Required?", required: true, width: "half",
              visibleIf: null, stepEditable: null },
            { key: "return_time", type: "time", label: "Expected Return Time", required: false, width: "half",
              visibleIf: { logic: "AND", rules: [{ fieldKey: "return_required", operator: "==", value: "true" }] },
              stepEditable: null },
            { key: "no_of_passengers", type: "number", label: "Number of Passengers", required: true, width: "half",
              validation: { min: 1, max: 20 }, visibleIf: null, stepEditable: null },
            { key: "vehicle_preference", type: "radio", label: "Vehicle Type", required: true, width: "half",
              options: ["Sedan / Hatchback", "SUV / Innova", "Mini Bus (8-15 seats)", "Bus (>15 seats)"],
              visibleIf: null, stepEditable: null },
            { key: "purpose", type: "textarea", label: "Purpose of Travel", required: true, width: "full",
              placeholder: "e.g. Client meeting at Ahmedabad airport...",
              visibleIf: null, stepEditable: null },
            { key: "admin_vehicle_notes", type: "textarea", label: "Admin / Driver Assignment Notes", required: false,
              adminOnly: true, stepEditable: "admin-arrange", width: "full", visibleIf: null },
          ],
        }],
      },
      workflowJson: {
        version: 1,
        nodes: [
          { id: "start", type: "start", position: { x: 250, y: 50 }, data: { label: "Start" } },
          { id: "manager-approval", type: "approval", position: { x: 250, y: 160 },
            data: { label: "Manager Approval", strategy: "manager_of_submitter",
              requireAll: false, allowReturn: true, slaDays: 1 } },
          { id: "admin-arrange", type: "approval", position: { x: 250, y: 290 },
            data: { label: "Admin Vehicle Arrangement", strategy: "department_head",
              requireAll: false, allowReturn: false, slaDays: 1 } },
          { id: "end-approved", type: "end-approved", position: { x: 250, y: 420 }, data: { label: "Arranged" } },
          { id: "end-rejected", type: "end-rejected", position: { x: 450, y: 420 }, data: { label: "Rejected" } },
        ],
        edges: [
          { id: "e1", source: "start",            target: "manager-approval" },
          { id: "e2", source: "manager-approval", target: "admin-arrange" },
          { id: "e3", source: "admin-arrange",    target: "end-approved" },
        ],
      },
    });

    // ── 18. Vehicle Requisition ───────────────────────────────────────────
    await createPublishedForm({
      title: "Vehicle Requisition",
      description: "Formal request for procurement of a new company vehicle. Routed through manager, department head, and GM for budget-based approval.",
      departmentId: adminDept.id,
      createdById: adminUser.id,
      schemaJson: {
        version: 1,
        pages: [
          {
            title: "Vehicle Details",
            fields: [
              { key: "requisition_type", type: "radio", label: "Requisition Type", required: true, width: "full",
                options: ["New Vehicle (Additional)", "Replacement Vehicle"],
                visibleIf: null, stepEditable: null },
              { key: "old_vehicle_details", type: "text", label: "Existing Vehicle Being Replaced", required: false, width: "full",
                placeholder: "e.g. Reg. No. GJ-01-AB-1234, 2015 Maruti Swift",
                visibleIf: { logic: "AND", rules: [{ fieldKey: "requisition_type", operator: "==", value: "Replacement Vehicle" }] },
                stepEditable: null },
              { key: "vehicle_category", type: "dropdown", label: "Vehicle Category Required", required: true, width: "half",
                options: ["Passenger Car (Sedan / Hatchback)", "SUV / MUV", "Luxury / Executive Car",
                          "Pickup Truck / Light Commercial", "Mini Bus (8–15 seats)", "Staff Bus (>15 seats)",
                          "Goods Vehicle", "Two Wheeler"],
                visibleIf: null, stepEditable: null },
              { key: "preferred_make_model", type: "text", label: "Preferred Make & Model", required: false, width: "half",
                placeholder: "e.g. Toyota Innova Crysta",
                visibleIf: null, stepEditable: null },
              { key: "fuel_type", type: "radio", label: "Fuel Type", required: true, width: "half",
                options: ["Petrol", "Diesel", "CNG", "Electric / Hybrid"],
                visibleIf: null, stepEditable: null },
              { key: "transmission", type: "radio", label: "Transmission", required: false, width: "half",
                options: ["Manual", "Automatic"],
                visibleIf: null, stepEditable: null },
            ],
          },
          {
            title: "Purpose & Budget",
            fields: [
              { key: "primary_use", type: "dropdown", label: "Primary Use", required: true, width: "half",
                options: ["Staff / Executive Transport", "Field Operations", "Client Visits", "Material / Goods Delivery",
                          "Site Inspection", "Airport / Station Transfers", "Other"],
                visibleIf: null, stepEditable: null },
              { key: "assigned_department", type: "text", label: "Assigned To (Department / Location)", required: true, width: "half",
                placeholder: "e.g. ACME HQ — Administration",
                visibleIf: null, stepEditable: null },
              { key: "estimated_daily_usage_km", type: "number", label: "Estimated Daily Usage (km)", required: false, width: "half",
                validation: { min: 0 }, visibleIf: null, stepEditable: null },
              { key: "estimated_budget", type: "number", label: "Estimated Budget (₹)", required: true, width: "half",
                validation: { min: 1 }, visibleIf: null, stepEditable: null },
              { key: "budget_head", type: "text", label: "Budget Head / Cost Centre", required: true, width: "half",
                placeholder: "e.g. ADMIN-CAPEX-2026",
                visibleIf: null, stepEditable: null },
              { key: "required_by_date", type: "date", label: "Required By Date", required: true, width: "half",
                visibleIf: null, stepEditable: null },
              { key: "justification", type: "textarea", label: "Justification / Business Need", required: true, width: "full",
                placeholder: "Explain the operational need, current gap, expected utilisation...",
                visibleIf: null, stepEditable: null },
              { key: "supporting_doc", type: "file-upload", label: "Supporting Documents", required: false, width: "full",
                fileConfig: { accept: ["application/pdf", "image/*"], maxSizeMb: 10, multiple: true },
                visibleIf: null, stepEditable: null },
              { key: "admin_procurement_notes", type: "textarea", label: "Admin / Procurement Notes", required: false,
                adminOnly: true, stepEditable: "admin-procurement", width: "full", visibleIf: null },
              { key: "gm_decision_notes", type: "textarea", label: "GM / Director Notes", required: false,
                adminOnly: true, stepEditable: "gm-approval", width: "full", visibleIf: null },
            ],
          },
        ],
      },
      workflowJson: {
        version: 1,
        nodes: [
          { id: "start", type: "start", position: { x: 250, y: 50 }, data: { label: "Start" } },
          { id: "manager-approval", type: "approval", position: { x: 250, y: 160 },
            data: { label: "Manager Approval", assigneeStrategy: "submitter-manager",
              anyOneApproves: true, allowReturn: true, slaDays: 2 } },
          { id: "dept-head-approval", type: "approval", position: { x: 250, y: 290 },
            data: { label: "Department Head Approval", assigneeStrategy: "dept-head",
              anyOneApproves: true, allowReturn: true, slaDays: 3 } },
          { id: "budget-branch", type: "condition", position: { x: 250, y: 420 },
            data: { label: "Budget > ₹10 Lakh?",
              branches: [
                { id: "high-budget",   label: "> ₹10,00,000", targetNodeId: "gm-approval",        rules: [{ fieldKey: "estimated_budget", operator: ">", value: "1000000" }], logic: "AND" },
                { id: "normal-budget", label: "≤ ₹10,00,000", targetNodeId: "admin-procurement",  rules: [], logic: "AND" },
              ] } },
          { id: "gm-approval", type: "approval", position: { x: 80, y: 550 },
            data: { label: "GM / Director Approval", assigneeStrategy: "designation",
              assigneeValue: "General Manager",
              anyOneApproves: true, allowReturn: false, slaDays: 5 } },
          { id: "admin-procurement", type: "approval", position: { x: 420, y: 550 },
            data: { label: "Admin Procurement Processing", assigneeStrategy: "dept-head",
              anyOneApproves: true, allowReturn: false, slaDays: 7 } },
          { id: "end-approved", type: "end-approved", position: { x: 250, y: 690 }, data: { label: "Approved for Procurement" } },
          { id: "end-rejected", type: "end-rejected", position: { x: 500, y: 420 }, data: { label: "Rejected" } },
        ],
        edges: [
          { id: "e1", source: "start",              target: "manager-approval" },
          { id: "e2", source: "manager-approval",   target: "dept-head-approval" },
          { id: "e3", source: "dept-head-approval", target: "budget-branch" },
          { id: "e4", source: "budget-branch",      target: "gm-approval",       sourceHandle: "high-budget" },
          { id: "e5", source: "budget-branch",      target: "admin-procurement", sourceHandle: "normal-budget" },
          { id: "e6", source: "gm-approval",        target: "admin-procurement" },
          { id: "e7", source: "admin-procurement",  target: "end-approved" },
        ],
      },
    });

    // ── 19. Meeting Room Booking ───────────────────────────────────────────
    await createPublishedForm({
      title: "Meeting Room Booking",
      description: "Reserve a conference or meeting room for internal or client meetings.",
      departmentId: adminDept.id,
      createdById: adminUser.id,
      schemaJson: {
        version: 1,
        pages: [{
          title: "Booking Details",
          fields: [
            { key: "room", type: "dropdown", label: "Room / Venue", required: true, width: "half",
              options: ["Board Room (20 seats)", "Conference Room A (12 seats)",
                        "Conference Room B (8 seats)", "Training Hall (50 seats)", "Pantry Meeting Space (4 seats)"],
              visibleIf: null, stepEditable: null },
            { key: "meeting_date", type: "date", label: "Meeting Date", required: true, width: "half",
              visibleIf: null, stepEditable: null },
            { key: "start_time", type: "time", label: "Start Time", required: true, width: "half",
              visibleIf: null, stepEditable: null },
            { key: "end_time", type: "time", label: "End Time", required: true, width: "half",
              visibleIf: null, stepEditable: null },
            { key: "expected_attendees", type: "number", label: "Expected Attendees", required: true, width: "half",
              validation: { min: 1 }, visibleIf: null, stepEditable: null },
            { key: "meeting_type", type: "radio", label: "Meeting Type", required: true, width: "half",
              options: ["Internal Team Meeting", "Client / External Meeting", "Training / Workshop",
                        "Video Conference", "Interview"],
              visibleIf: null, stepEditable: null },
            { key: "refreshments", type: "yes-no", label: "Refreshments Required?", required: true, width: "half",
              visibleIf: null, stepEditable: null },
            { key: "av_equipment", type: "checkbox-group", label: "AV Equipment Needed", required: false, width: "full",
              options: ["Projector", "Display Screen", "Whiteboard", "Video Conferencing System",
                        "Microphone / Speaker", "Laptop"],
              visibleIf: null, stepEditable: null },
            { key: "agenda", type: "textarea", label: "Meeting Agenda (brief)", required: false, width: "full",
              placeholder: "Brief agenda or purpose of the meeting",
              visibleIf: null, stepEditable: null },
            { key: "admin_confirm_notes", type: "textarea", label: "Admin Confirmation Notes", required: false,
              adminOnly: true, stepEditable: "admin-confirm", width: "full", visibleIf: null },
          ],
        }],
      },
      workflowJson: {
        version: 1,
        nodes: [
          { id: "start", type: "start", position: { x: 250, y: 50 }, data: { label: "Start" } },
          { id: "room-branch", type: "condition", position: { x: 250, y: 160 },
            data: { label: "Board Room?",
              branches: [
                { id: "boardroom", label: "Board Room", targetNodeId: "manager-approval", rules: [{ fieldKey: "room", operator: "==", value: "Board Room (20 seats)" }], logic: "AND" },
                { id: "normal",    label: "Other Room",  targetNodeId: "admin-confirm",   rules: [], logic: "AND" },
              ] } },
          { id: "manager-approval", type: "approval", position: { x: 80, y: 290 },
            data: { label: "Manager Approval (Board Room)", strategy: "manager_of_submitter",
              requireAll: false, allowReturn: true, slaDays: 1 } },
          { id: "admin-confirm", type: "approval", position: { x: 420, y: 290 },
            data: { label: "Admin Confirmation", strategy: "department_head",
              requireAll: false, allowReturn: false, slaDays: 1 } },
          { id: "end-approved", type: "end-approved", position: { x: 250, y: 420 }, data: { label: "Confirmed" } },
          { id: "end-rejected", type: "end-rejected", position: { x: 460, y: 420 }, data: { label: "Rejected" } },
        ],
        edges: [
          { id: "e1", source: "start",            target: "room-branch" },
          { id: "e2", source: "room-branch",      target: "manager-approval", sourceHandle: "boardroom" },
          { id: "e3", source: "room-branch",      target: "admin-confirm",    sourceHandle: "normal" },
          { id: "e4", source: "manager-approval", target: "admin-confirm" },
          { id: "e5", source: "admin-confirm",    target: "end-approved" },
        ],
      },
    });
  }

  // ── I-Card Data Collection Form (HR) ────────────────────────────────────
  if (hrDept && hrAdmin) {
    console.log("\n  📁 HR Department forms (additional):");
    await createPublishedForm({
      title: "I-Card Data Collection",
      description: "Employee identity card data form. Fill personal details for ID card issuance. HR will review and export for printing.",
      departmentId: hrDept.id,
      createdById: hrAdmin.id,
      schemaJson: {
        version: 1,
        pages: [
          {
            title: "Personal Information",
            fields: [
              { key: "full_name", type: "auto_submitter_name", label: "Full Name", required: true, width: "half",
                visibleIf: null, stepEditable: null },
              { key: "staff_number", type: "text", label: "Staff / Employee Number", required: true, width: "half",
                placeholder: "e.g. EMP-2024-001", visibleIf: null, stepEditable: null },
              { key: "department", type: "auto_submitter_department", label: "Department", required: true, width: "half",
                visibleIf: null, stepEditable: null },
              { key: "designation", type: "auto_submitter_designation", label: "Designation", required: true, width: "half",
                visibleIf: null, stepEditable: null },
              { key: "date_of_birth", type: "date", label: "Date of Birth", required: true, width: "half",
                visibleIf: null, stepEditable: null },
              { key: "blood_group", type: "dropdown", label: "Blood Group", required: true, width: "half",
                options: ["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"],
                visibleIf: null, stepEditable: null },
              { key: "gender", type: "radio", label: "Gender", required: true, width: "half",
                options: ["Male", "Female", "Other"],
                visibleIf: null, stepEditable: null },
              { key: "personal_email", type: "email", label: "Personal Email Address", required: false, width: "half",
                placeholder: "personal@example.com", visibleIf: null, stepEditable: null },
              { key: "personal_mobile", type: "phone", label: "Personal Mobile Number", required: true, width: "half",
                placeholder: "+91 9XXXXXXXXX", visibleIf: null, stepEditable: null },
            ],
          },
          {
            title: "Contact & Address",
            fields: [
              { key: "emergency_contact_name", type: "text", label: "Emergency Contact Name", required: true, width: "half",
                placeholder: "Full name of emergency contact", visibleIf: null, stepEditable: null },
              { key: "emergency_contact_relation", type: "dropdown", label: "Relationship", required: true, width: "half",
                options: ["Spouse", "Parent", "Sibling", "Child", "Friend", "Other"],
                visibleIf: null, stepEditable: null },
              { key: "emergency_contact_phone", type: "phone", label: "Emergency Contact Phone", required: true, width: "half",
                placeholder: "+91 9XXXXXXXXX", visibleIf: null, stepEditable: null },
              { key: "permanent_address", type: "textarea", label: "Permanent Address", required: true, width: "full",
                placeholder: "House/Flat No., Street, Area, City, State, PIN",
                visibleIf: null, stepEditable: null },
            ],
          },
          {
            title: "Photo & Documents",
            fields: [
              { key: "photo", type: "file", label: "Passport-size Photograph", required: true, width: "full",
                helpText: "Upload a recent passport-size photo (JPG/PNG, max 2 MB, white background preferred)",
                fileTypes: ["image/jpeg", "image/png"], maxFileSizeMB: 2,
                visibleIf: null, stepEditable: null },
              { key: "signature", type: "signature", label: "Signature", required: true, width: "full",
                helpText: "Draw your signature in the box below",
                visibleIf: null, stepEditable: null },
              { key: "declaration", type: "checkbox_group", label: "Declaration", required: true, width: "full",
                options: ["I confirm that the above information is true and correct to the best of my knowledge."],
                visibleIf: null, stepEditable: null },
              { key: "hr_remarks", type: "textarea", label: "HR Remarks", required: false, width: "full",
                placeholder: "HR use only — any notes for ID card issuance",
                adminOnly: true, stepEditable: "hr-review", visibleIf: null },
            ],
          },
        ],
      },
      workflowJson: {
        version: 1,
        nodes: [
          { id: "start",      type: "start",        position: { x: 250, y: 50  }, data: { label: "Start" } },
          { id: "hr-review",  type: "approval",     position: { x: 250, y: 180 },
            data: { label: "HR Review & Verification", strategy: "department_head",
              requireAll: false, allowReturn: true, slaDays: 3 } },
          { id: "end-approved", type: "end-approved", position: { x: 250, y: 330 }, data: { label: "I-Card Approved" } },
          { id: "end-rejected", type: "end-rejected", position: { x: 460, y: 330 }, data: { label: "Rejected" } },
        ],
        edges: [
          { id: "e1", source: "start",     target: "hr-review"    },
          { id: "e2", source: "hr-review", target: "end-approved" },
        ],
      },
    });
  }

  // ── Backfill slugs for any existing forms that don't have one ────────────
  const formsWithoutSlug = await prisma.form.findMany({ where: { slug: null } });
  if (formsWithoutSlug.length > 0) {
    console.log(`\n  🔧 Backfilling slugs for ${formsWithoutSlug.length} existing form(s)...`);
    for (const f of formsWithoutSlug) {
      const slug = await generateUniqueSlug(f.title);
      await prisma.form.update({ where: { id: f.id }, data: { slug } });
      console.log(`    ✓ "${f.title}" → /forms/${slug}`);
    }
  }

  console.log("\n✅ Seed complete!");
  console.log("\nDemo credentials (DEV_MOCK_LDAP=true):");
  console.log("  superadmin / Admin@123  →  SUPER_ADMIN");
  console.log("  itadmin    / Admin@123  →  DEPT_ADMIN (ACME IT)");
  console.log("  hradmin    / Admin@123  →  DEPT_ADMIN (ACME HR)");
  console.log("  jdoe       / User@123   →  USER");
  console.log("  asmith     / User@123   →  USER");
  console.log("  manager1   / Admin@123  →  USER (acts as manager approver)");
  console.log("\nForms seeded (20 total across 4 departments):");
  console.log("  IT (5):      IT Asset Request, IT Support Request, Software Installation,");
  console.log("               VPN/Remote Access, System Access Request");
  console.log("  HR (6):      Leave Application, Salary Advance, Training & Development,");
  console.log("               Employee Transfer, Travel & Expense Claim, I-Card Data Collection");
  console.log("  Finance (4): Purchase Order, Petty Cash Reimbursement,");
  console.log("               Budget Reallocation, Vendor Payment Approval");
  console.log("  Admin (5):   Office Supply Request, Visitor Pass Request,");
  console.log("               Vehicle/Transport Request, Vehicle Requisition, Meeting Room Booking");
}

main()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
