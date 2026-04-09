import type { Department, DepartmentId, OrgMember, RoleLevel } from "../types/org";
import { buildSystemPrompt } from "./system-prompts";

let memberIdCounter = 0;
function nextId(): string {
  memberIdCounter++;
  return `member-${memberIdCounter.toString().padStart(3, "0")}`;
}

function member(
  name: string,
  role: string,
  level: RoleLevel,
  department: DepartmentId,
  reportsTo: string | null,
  expertise: string[],
): OrgMember {
  const id = nextId();
  return {
    id,
    name,
    role,
    level,
    department,
    reportsTo,
    directReports: [],
    expertise,
    systemPrompt: buildSystemPrompt(role, department, expertise, level),
    status: "idle",
    currentTaskId: null,
  };
}

function buildOrgChart(): {
  members: Map<string, OrgMember>;
  departments: Map<DepartmentId, Department>;
} {
  memberIdCounter = 0;
  const members = new Map<string, OrgMember>();

  const ceo = member("Alex Rivera", "CEO", "c-suite", "executive", null, [
    "strategic planning",
    "decision making",
    "stakeholder management",
    "problem decomposition",
  ]);
  const cto = member("Jordan Chen", "CTO", "c-suite", "executive", ceo.id, [
    "technology strategy",
    "system architecture",
    "technical leadership",
    "innovation",
  ]);
  const cfo = member("Morgan Blake", "CFO", "c-suite", "executive", ceo.id, [
    "resource allocation",
    "cost optimization",
    "risk assessment",
    "budgeting",
  ]);
  const cpo = member("Casey Kim", "CPO", "c-suite", "executive", ceo.id, [
    "product strategy",
    "user experience",
    "market analysis",
    "roadmap planning",
  ]);
  const ciso = member("Riley Torres", "CISO", "c-suite", "security", ceo.id, [
    "security strategy",
    "threat modeling",
    "compliance",
    "incident response",
  ]);

  const vpEng = member("Sam Patel", "VP Engineering", "vp", "engineering", cto.id, [
    "engineering management",
    "delivery",
    "scaling teams",
    "process improvement",
  ]);
  const vpArch = member("Taylor Nguyen", "VP Architecture", "vp", "architecture", cto.id, [
    "system design",
    "technical standards",
    "architecture review",
    "technology evaluation",
  ]);
  const vpProduct = member("Avery Johnson", "VP Product", "vp", "product", cpo.id, [
    "product management",
    "feature prioritization",
    "user research",
    "analytics",
  ]);
  const vpDesign = member("Quinn Martinez", "VP Design", "vp", "design", cpo.id, [
    "design systems",
    "user interface",
    "accessibility",
    "visual design",
  ]);

  const dirFrontend = member(
    "Harper Lee",
    "Director of Frontend",
    "director",
    "frontend",
    vpEng.id,
    ["React", "TypeScript", "CSS", "web performance", "component architecture"],
  );
  const dirBackend = member(
    "Emerson Park",
    "Director of Backend",
    "director",
    "backend",
    vpEng.id,
    ["Rust", "Node.js", "API design", "databases", "microservices"],
  );
  const dirQA = member("Dakota Reeves", "Director of QA", "director", "qa", vpEng.id, [
    "test strategy",
    "automation",
    "quality assurance",
    "regression testing",
  ]);
  const dirDevOps = member("Finley Cruz", "Director of DevOps", "director", "devops", vpEng.id, [
    "CI/CD",
    "infrastructure",
    "deployment",
    "monitoring",
    "containerization",
  ]);
  const dirData = member("Rowan Smith", "Director of Data", "director", "data", vpEng.id, [
    "data engineering",
    "analytics",
    "machine learning",
    "data modeling",
  ]);
  const dirDocs = member(
    "Sage Hoffman",
    "Director of Documentation",
    "director",
    "documentation",
    vpProduct.id,
    ["technical writing", "API documentation", "user guides", "knowledge management"],
  );
  const dirSupport = member(
    "Phoenix Gray",
    "Director of Support",
    "director",
    "support",
    vpProduct.id,
    ["customer support", "issue triage", "escalation management", "feedback collection"],
  );

  const chiefArch = member("Remy Foster", "Chief Architect", "lead", "architecture", vpArch.id, [
    "distributed systems",
    "event-driven architecture",
    "domain-driven design",
  ]);
  const secArch = member(
    "Blair Mitchell",
    "Security Architect",
    "lead",
    "architecture",
    vpArch.id,
    ["security architecture", "encryption", "authentication", "authorization"],
  );
  const platformArch = member(
    "Aston Voss",
    "Platform Architect",
    "senior",
    "architecture",
    chiefArch.id,
    ["plugin systems", "extension APIs", "cross-platform compatibility"],
  );
  const infraArch = member(
    "Kit Lawson",
    "Infrastructure Architect",
    "senior",
    "architecture",
    chiefArch.id,
    ["cloud architecture", "scalability patterns", "deployment strategies"],
  );

  const engOps = member(
    "Lane Kirby",
    "Engineering Operations Lead",
    "lead",
    "engineering",
    vpEng.id,
    ["developer experience", "tooling", "process automation", "onboarding"],
  );
  const engOpsMembers: OrgMember[] = [
    member("Sol Graves", "Engineering Operations Specialist", "mid", "engineering", engOps.id, [
      "build tooling",
      "developer productivity",
      "automation",
    ]),
    member("Cove Harmon", "Engineering Operations Specialist", "mid", "engineering", engOps.id, [
      "code review tooling",
      "metrics",
      "dashboards",
    ]),
    member("Sage Albright", "Junior Engineering Operations", "junior", "engineering", engOps.id, [
      "scripting",
      "tool maintenance",
      "documentation",
    ]),
  ];

  const coo = member("Kendall Orozco", "COO", "c-suite", "executive", ceo.id, [
    "operations management",
    "process optimization",
    "cross-functional coordination",
    "execution",
  ]);
  const chiefOfStaff = member("Marlowe Eaton", "Chief of Staff", "vp", "executive", ceo.id, [
    "executive support",
    "strategic initiatives",
    "communication",
    "meeting coordination",
  ]);

  const allExecs = [
    ceo,
    cto,
    cfo,
    cpo,
    ciso,
    coo,
    chiefOfStaff,
    vpEng,
    vpArch,
    vpProduct,
    vpDesign,
    dirFrontend,
    dirBackend,
    dirQA,
    dirDevOps,
    dirData,
    dirDocs,
    dirSupport,
    chiefArch,
    secArch,
    platformArch,
    infraArch,
    engOps,
    ...engOpsMembers,
  ];

  const feMgr1 = member("Ellis Wright", "Frontend Manager", "manager", "frontend", dirFrontend.id, [
    "React",
    "state management",
    "component libraries",
    "testing",
  ]);
  const feMgr2 = member(
    "Drew Campbell",
    "Frontend Manager",
    "manager",
    "frontend",
    dirFrontend.id,
    ["CSS", "animations", "responsive design", "accessibility"],
  );

  const feLead1 = member("Kai Yamamoto", "Senior Frontend Lead", "lead", "frontend", feMgr1.id, [
    "React",
    "TypeScript",
    "Zustand",
    "performance optimization",
  ]);
  const feLead2 = member("Rio Santos", "Frontend Lead", "lead", "frontend", feMgr2.id, [
    "CSS architecture",
    "Tailwind",
    "design systems",
    "animations",
  ]);

  const feSeniors: OrgMember[] = [
    member("Aspen Cole", "Senior Frontend Engineer", "senior", "frontend", feLead1.id, [
      "React hooks",
      "TypeScript",
      "testing",
    ]),
    member("Lennox Reed", "Senior Frontend Engineer", "senior", "frontend", feLead1.id, [
      "state management",
      "API integration",
      "performance",
    ]),
    member("Marlowe Quinn", "Senior Frontend Engineer", "senior", "frontend", feLead2.id, [
      "CSS-in-JS",
      "animations",
      "responsive design",
    ]),
    member("Hollis Grant", "Senior Frontend Engineer", "senior", "frontend", feLead2.id, [
      "accessibility",
      "design systems",
      "component patterns",
    ]),
  ];
  const feMids: OrgMember[] = [
    member("Sutton Hayes", "Frontend Engineer", "mid", "frontend", feLead1.id, [
      "React",
      "TypeScript",
      "unit testing",
    ]),
    member("Oakley Price", "Frontend Engineer", "mid", "frontend", feLead1.id, [
      "React",
      "CSS",
      "component development",
    ]),
    member("Briar Fox", "Frontend Engineer", "mid", "frontend", feLead2.id, [
      "Tailwind CSS",
      "responsive layouts",
      "design implementation",
    ]),
    member("Perry Stone", "Frontend Engineer", "mid", "frontend", feLead2.id, [
      "React",
      "state management",
      "forms",
    ]),
  ];
  const feJuniors: OrgMember[] = [
    member("Lark Chen", "Junior Frontend Engineer", "junior", "frontend", feLead1.id, [
      "React basics",
      "HTML",
      "CSS",
    ]),
    member("Wren Peters", "Junior Frontend Engineer", "junior", "frontend", feLead2.id, [
      "JavaScript",
      "React fundamentals",
      "debugging",
    ]),
    member("Dove Pennington", "Junior Frontend Engineer", "junior", "frontend", feLead1.id, [
      "TypeScript basics",
      "CSS modules",
      "testing",
    ]),
  ];

  const beMgr1 = member("Shay Cooper", "Backend Manager", "manager", "backend", dirBackend.id, [
    "Rust",
    "systems programming",
    "API design",
    "database optimization",
  ]);
  const beMgr2 = member("Jules Morgan", "Backend Manager", "manager", "backend", dirBackend.id, [
    "Node.js",
    "microservices",
    "event-driven architecture",
    "caching",
  ]);
  const beLead1 = member("Arden Bailey", "Senior Backend Lead", "lead", "backend", beMgr1.id, [
    "Rust",
    "Tauri",
    "systems design",
    "performance tuning",
  ]);
  const beLead2 = member("Sterling Nash", "Backend Lead", "lead", "backend", beMgr2.id, [
    "Node.js",
    "TypeScript",
    "REST APIs",
    "GraphQL",
  ]);
  const beSeniors: OrgMember[] = [
    member("Haven Brooks", "Senior Backend Engineer", "senior", "backend", beLead1.id, [
      "Rust",
      "async programming",
      "Tauri commands",
    ]),
    member("Reece Hale", "Senior Backend Engineer", "senior", "backend", beLead1.id, [
      "database design",
      "SQL",
      "query optimization",
    ]),
    member("Skyler Dunn", "Senior Backend Engineer", "senior", "backend", beLead2.id, [
      "Node.js",
      "API gateway",
      "authentication",
    ]),
    member("Rory Wells", "Senior Backend Engineer", "senior", "backend", beLead2.id, [
      "microservices",
      "message queues",
      "caching strategies",
    ]),
  ];
  const beMids: OrgMember[] = [
    member("Tatum Frost", "Backend Engineer", "mid", "backend", beLead1.id, [
      "Rust",
      "error handling",
      "testing",
    ]),
    member("Blair Kendall", "Backend Engineer", "mid", "backend", beLead1.id, [
      "Rust",
      "file systems",
      "serialization",
    ]),
    member("Addison Cole", "Backend Engineer", "mid", "backend", beLead2.id, [
      "Node.js",
      "Express",
      "middleware",
    ]),
    member("Harley Dean", "Backend Engineer", "mid", "backend", beLead2.id, [
      "TypeScript",
      "database migrations",
      "testing",
    ]),
  ];
  const beJuniors: OrgMember[] = [
    member("Indigo Walsh", "Junior Backend Engineer", "junior", "backend", beLead1.id, [
      "Rust basics",
      "CLI tools",
      "debugging",
    ]),
    member("Noel Francis", "Junior Backend Engineer", "junior", "backend", beLead2.id, [
      "Node.js basics",
      "REST APIs",
      "SQL",
    ]),
    member("Cliff Marlow", "Junior Backend Engineer", "junior", "backend", beLead1.id, [
      "Rust traits",
      "error patterns",
      "testing",
    ]),
  ];

  const qaMgr = member("Carmen Silva", "QA Manager", "manager", "qa", dirQA.id, [
    "test planning",
    "automation frameworks",
    "quality metrics",
  ]);
  const qaLead = member("Micah Long", "QA Lead", "lead", "qa", qaMgr.id, [
    "test automation",
    "E2E testing",
    "CI integration",
  ]);
  const qaEngineers: OrgMember[] = [
    member("River Lin", "Senior QA Engineer", "senior", "qa", qaLead.id, [
      "test automation",
      "Playwright",
      "performance testing",
    ]),
    member("Sage Turner", "QA Engineer", "mid", "qa", qaLead.id, [
      "manual testing",
      "regression testing",
      "bug reporting",
    ]),
    member("Lake Adams", "QA Engineer", "mid", "qa", qaLead.id, [
      "API testing",
      "integration testing",
      "test data management",
    ]),
    member("Brook Nash", "Junior QA Engineer", "junior", "qa", qaLead.id, [
      "testing fundamentals",
      "bug reproduction",
      "test case writing",
    ]),
  ];

  const devopsMgr = member("Corin West", "DevOps Manager", "manager", "devops", dirDevOps.id, [
    "infrastructure",
    "automation",
    "cloud services",
  ]);
  const devopsEngineers: OrgMember[] = [
    member("Ashton Vale", "Senior DevOps Engineer", "senior", "devops", devopsMgr.id, [
      "Docker",
      "CI/CD pipelines",
      "GitHub Actions",
    ]),
    member("Soren Cross", "DevOps Engineer", "mid", "devops", devopsMgr.id, [
      "infrastructure as code",
      "monitoring",
      "logging",
    ]),
    member("Darcy Fields", "DevOps Engineer", "mid", "devops", devopsMgr.id, [
      "build systems",
      "deployment automation",
      "scripting",
    ]),
  ];

  const secMgr = member("Piper Vance", "Security Manager", "manager", "security", ciso.id, [
    "security operations",
    "team coordination",
    "risk management",
  ]);
  const secEngineers: OrgMember[] = [
    member("Marin Locke", "Senior Security Engineer", "senior", "security", secMgr.id, [
      "vulnerability assessment",
      "penetration testing",
      "code review",
    ]),
    member("Sloane Reid", "Security Engineer", "mid", "security", secMgr.id, [
      "security scanning",
      "dependency auditing",
      "compliance",
    ]),
    member("Torin Beck", "Security Analyst", "mid", "security", secMgr.id, [
      "threat analysis",
      "security monitoring",
      "incident response",
    ]),
    member("Blythe Kemp", "Security Engineer", "mid", "security", secMgr.id, [
      "access controls",
      "OAuth",
      "JWT",
    ]),
    member("Lux Mercer", "Junior Security Analyst", "junior", "security", secMgr.id, [
      "log analysis",
      "alert triage",
      "documentation",
    ]),
  ];

  const dataMgr = member(
    "Fen Castillo",
    "Data Engineering Manager",
    "manager",
    "data",
    dirData.id,
    ["data strategy", "team management", "data governance"],
  );
  const dataEngineers: OrgMember[] = [
    member("Milan Hart", "Senior Data Engineer", "senior", "data", dataMgr.id, [
      "data pipelines",
      "ETL",
      "analytics",
    ]),
    member("Nico Crane", "Data Engineer", "mid", "data", dataMgr.id, [
      "SQL",
      "data modeling",
      "visualization",
    ]),
    member("Ariel Stone", "Data Analyst", "mid", "data", dataMgr.id, [
      "analytics",
      "reporting",
      "metrics",
    ]),
    member("Vesper Hahn", "Data Engineer", "mid", "data", dataMgr.id, [
      "data ingestion",
      "schema design",
      "validation",
    ]),
    member("Onyx Bloom", "Junior Data Analyst", "junior", "data", dataMgr.id, [
      "SQL basics",
      "data cleaning",
      "reporting",
    ]),
  ];

  const productTeam: OrgMember[] = [
    member("Jamie Lowe", "Senior Product Manager", "senior", "product", vpProduct.id, [
      "feature specification",
      "user stories",
      "prioritization",
    ]),
    member("Hayden Marsh", "Product Manager", "mid", "product", vpProduct.id, [
      "requirements gathering",
      "stakeholder communication",
      "roadmaps",
    ]),
    member("Logan Pierce", "Product Analyst", "mid", "product", vpProduct.id, [
      "data analysis",
      "A/B testing",
      "metrics",
    ]),
    member("Ember Fox", "Associate Product Manager", "junior", "product", vpProduct.id, [
      "competitive analysis",
      "user feedback",
      "documentation",
    ]),
    member("Zephyr Hale", "Product Manager", "mid", "product", vpProduct.id, [
      "market research",
      "go-to-market",
      "pricing",
    ]),
  ];

  const designTeam: OrgMember[] = [
    member("Eden Rivera", "Senior UX Designer", "senior", "design", vpDesign.id, [
      "user research",
      "wireframing",
      "prototyping",
    ]),
    member("Roan Mitchell", "UI Designer", "mid", "design", vpDesign.id, [
      "visual design",
      "design systems",
      "iconography",
    ]),
    member("Teagan Boyd", "UX Researcher", "mid", "design", vpDesign.id, [
      "user testing",
      "surveys",
      "usability analysis",
    ]),
    member("Lyric Sato", "Visual Designer", "mid", "design", vpDesign.id, [
      "branding",
      "illustrations",
      "motion design",
    ]),
    member("Clover Tran", "Junior UX Designer", "junior", "design", vpDesign.id, [
      "wireframes",
      "user flows",
      "design tools",
    ]),
  ];

  const docTeam: OrgMember[] = [
    member("Linden Shaw", "Senior Technical Writer", "senior", "documentation", dirDocs.id, [
      "API docs",
      "developer guides",
      "tutorials",
    ]),
    member("Kerry West", "Technical Writer", "mid", "documentation", dirDocs.id, [
      "user guides",
      "changelogs",
      "FAQs",
    ]),
    member("Skylar Ash", "Technical Writer", "mid", "documentation", dirDocs.id, [
      "reference docs",
      "architecture docs",
      "diagrams",
    ]),
    member("Cypress Moon", "Junior Technical Writer", "junior", "documentation", dirDocs.id, [
      "editing",
      "formatting",
      "screenshots",
    ]),
  ];

  const supportTeam: OrgMember[] = [
    member("Devon Park", "Senior Support Engineer", "senior", "support", dirSupport.id, [
      "debugging",
      "customer communication",
      "issue resolution",
    ]),
    member("Carey Flynn", "Support Engineer", "mid", "support", dirSupport.id, [
      "ticket management",
      "troubleshooting",
      "documentation",
    ]),
    member("Coral Vega", "Support Engineer", "mid", "support", dirSupport.id, [
      "bug reproduction",
      "workarounds",
      "escalation",
    ]),
    member("Bryn Calloway", "Junior Support Specialist", "junior", "support", dirSupport.id, [
      "ticket triage",
      "FAQ updates",
      "customer responses",
    ]),
  ];

  const devopsJuniors: OrgMember[] = [
    member("Echo Raines", "Junior DevOps Engineer", "junior", "devops", devopsMgr.id, [
      "shell scripting",
      "CI basics",
      "Linux",
    ]),
    member("Yarrow Dell", "DevOps Engineer", "mid", "devops", devopsMgr.id, [
      "Kubernetes",
      "Helm",
      "cloud networking",
    ]),
  ];

  const qaExtras: OrgMember[] = [
    member("Fable Frost", "QA Engineer", "mid", "qa", qaLead.id, [
      "accessibility testing",
      "cross-browser testing",
      "visual regression",
    ]),
    member("Harbor Knight", "Junior QA Engineer", "junior", "qa", qaLead.id, [
      "smoke testing",
      "exploratory testing",
      "test reports",
    ]),
  ];

  const allMembers = [
    ...allExecs,
    feMgr1,
    feMgr2,
    feLead1,
    feLead2,
    ...feSeniors,
    ...feMids,
    ...feJuniors,
    beMgr1,
    beMgr2,
    beLead1,
    beLead2,
    ...beSeniors,
    ...beMids,
    ...beJuniors,
    qaMgr,
    qaLead,
    ...qaEngineers,
    ...qaExtras,
    devopsMgr,
    ...devopsEngineers,
    ...devopsJuniors,
    secMgr,
    ...secEngineers,
    dataMgr,
    ...dataEngineers,
    ...productTeam,
    ...designTeam,
    ...docTeam,
    ...supportTeam,
  ];

  for (const m of allMembers) {
    members.set(m.id, m);
  }

  for (const m of allMembers) {
    if (m.reportsTo) {
      const manager = members.get(m.reportsTo);
      if (manager && !manager.directReports.includes(m.id)) {
        manager.directReports.push(m.id);
      }
    }
  }

  const departments = new Map<DepartmentId, Department>();

  const deptDefs: Array<{ id: DepartmentId; name: string; head: string }> = [
    { id: "executive", name: "Executive Leadership", head: ceo.id },
    { id: "engineering", name: "Engineering", head: vpEng.id },
    { id: "architecture", name: "Architecture", head: vpArch.id },
    { id: "frontend", name: "Frontend Engineering", head: dirFrontend.id },
    { id: "backend", name: "Backend Engineering", head: dirBackend.id },
    { id: "qa", name: "Quality Assurance", head: dirQA.id },
    { id: "devops", name: "DevOps", head: dirDevOps.id },
    { id: "security", name: "Security", head: ciso.id },
    { id: "data", name: "Data Engineering", head: dirData.id },
    { id: "product", name: "Product", head: vpProduct.id },
    { id: "design", name: "Design", head: vpDesign.id },
    { id: "documentation", name: "Documentation", head: dirDocs.id },
    { id: "support", name: "Support", head: dirSupport.id },
  ];

  for (const dept of deptDefs) {
    const deptMembers = allMembers.filter((m) => m.department === dept.id).map((m) => m.id);
    departments.set(dept.id, {
      id: dept.id,
      name: dept.name,
      head: dept.head,
      members: deptMembers,
      description: `${dept.name} department`,
    });
  }

  return { members, departments };
}

export const ORG_CHART = buildOrgChart();
export const CEO_ID = "member-001";
export const TOTAL_MEMBERS = ORG_CHART.members.size;
