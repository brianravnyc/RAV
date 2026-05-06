import React, { useState, useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

export default function BurnupDashboard() {
  const [csvData, setCsvData] = useState(null);
  const [projectsData, setProjectsData] = useState(null);
  const [invoiceData, setInvoiceData] = useState(null);
  const [selectedProject, setSelectedProject] = useState(null);
  const [activeView, setActiveView] = useState('overview');
  const [sortBy, setSortBy] = useState('consumed-desc');

  const handleHarvestUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      const csv = event.target.result;
      const lines = csv.split('\n');
      const headers = lines[0].split(',').map(h => h.trim());
      const data = lines.slice(1).filter(line => line.trim()).map(line => {
        const values = line.split(',');
        const obj = {};
        headers.forEach((header, i) => {
          obj[header] = values[i]?.trim() || '';
        });
        return obj;
      });
      setCsvData(data);
      console.log('Harvest data loaded:', data.length, 'projects');
    };
    reader.readAsText(file);
  };

  const handleProjectsUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      const csv = event.target.result;
      const lines = csv.split('\n');
      
      const parseCSVLine = (line) => {
        const result = [];
        let current = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
          const char = line[i];
          if (char === '"') {
            inQuotes = !inQuotes;
          } else if (char === ',' && !inQuotes) {
            result.push(current.trim().replace(/^"|"$/g, ''));
            current = '';
          } else {
            current += char;
          }
        }
        result.push(current.trim().replace(/^"|"$/g, ''));
        return result;
      };
      
      const headers = parseCSVLine(lines[0]);
      const data = lines.slice(1).filter(line => line.trim()).map(line => {
        const values = parseCSVLine(line);
        const obj = {};
        headers.forEach((header, i) => {
          obj[header] = values[i] || '';
        });
        return obj;
      });
      setProjectsData(data);
      console.log('Projects data loaded:', data.length, 'projects');
    };
    reader.readAsText(file);
  };

  const handleInvoiceUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      const csv = event.target.result;
      const lines = csv.split('\n');
      
      const parseCSVLine = (line) => {
        const result = [];
        let current = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
          const char = line[i];
          if (char === '"') {
            inQuotes = !inQuotes;
          } else if (char === ',' && !inQuotes) {
            result.push(current.trim().replace(/^"|"$/g, ''));
            current = '';
          } else {
            current += char;
          }
        }
        result.push(current.trim().replace(/^"|"$/g, ''));
        return result;
      };
      
      const headers = parseCSVLine(lines[0]);
      const data = lines.slice(1).filter(line => line.trim()).map(line => {
        const values = parseCSVLine(line);
        const obj = {};
        headers.forEach((header, i) => {
          obj[header] = values[i] || '';
        });
        return obj;
      });
      setInvoiceData(data);
      console.log('Invoice data loaded:', data.length, 'invoices');
    };
    reader.readAsText(file);
  };

  // Process and calculate project data
  const activeProjects = useMemo(() => {
    if (!csvData || !projectsData) return [];

    const active = projectsData.filter(p => {
      const archivedFlag = p['Archived']?.toLowerCase() === 'true';
      const hasCreatedDate = p['Created Date'] && p['Created Date'].trim();
      return hasCreatedDate && !archivedFlag;
    });

    console.log('Active projects:', active.length);

    return active.map(proj => {
      const projectCode = proj['Number']?.trim() || '';
      let harvested = null;

      if (projectCode) {
        harvested = csvData.find(h => {
          const harvestCode = h['Project Code']?.trim() || '';
          return harvestCode === projectCode;
        });
      }

      if (!harvested) {
        console.warn(`No Harvest data found for project ${projectCode}: ${proj['Name']}`);
        return null;
      }

      const createdDate = new Date(proj['Created Date']);
      const projectValue = parseFloat(proj['Price']) || 0;
      
      const consumedHours = parseFloat(harvested['Billable Hours']?.replace(/,/g, '')) || 0;
      const totalHours = parseFloat(harvested['Total Hours']?.replace(/,/g, '')) || 0;
      const nonBillableHours = Math.round((totalHours - consumedHours) * 100) / 100;
      
      const budget = parseFloat(harvested['Budget']?.replace(/,/g, '')) || 0;
      const budgetSpent = parseFloat(harvested['Budget Spent']?.replace(/,/g, '')) || 0;
      const budgetRemaining = parseFloat(harvested['Budget Remaining']?.replace(/,/g, '')) || 0;
      
      const budgetValue = budget > 0 ? budget : projectValue;
      const consumedPercent = budgetValue > 0 ? (budgetSpent / budgetValue) * 100 : 0;
      
      const billableAmount = parseFloat(harvested['Billable Amount']?.replace(/,/g, '')) || 0;
      const harvestInvoicedAmount = parseFloat(harvested['Invoiced Amount']?.replace(/,/g, '')) || 0;

      // Calculate invoiced total from invoice CSV if available
      let invoicedTotal = harvestInvoicedAmount;
      if (invoiceData && invoiceData.length > 0) {
        invoicedTotal = invoiceData
          .filter(inv => {
            const paymentTerms = inv['Payment Terms'] || '';
            const match = paymentTerms.match(/\[P-(\d+)\]/);
            return match && `P-${match[1]}` === projectCode;
          })
          .reduce((sum, inv) => {
            const paidAmount = parseFloat(inv['Paid Amount']?.replace(/,/g, '')) || 
                              parseFloat(inv['Amount']?.replace(/,/g, '')) || 0;
            return sum + paidAmount;
          }, 0);
      }

      const daysElapsed = Math.floor((new Date() - createdDate) / (1000 * 60 * 60 * 24));
      const dailyBurnRate = daysElapsed > 0 ? consumedHours / daysElapsed : 0;

      // Calculate Revenue at Risk = Budget Spent - Invoiced Amount
      const revenueAtRisk = budgetSpent - invoicedTotal;
      const invoicedPercent = budgetSpent > 0 ? (invoicedTotal / budgetSpent) * 100 : 100;

      // Risk Status Tiers:
      // 🟢 Healthy: 100% invoiced (fully collected)
      // 🟡 Warning: 50-100% invoiced (some money owed)
      // 🔴 Over: <50% invoiced (critical: lots of money owed) OR over budget
      let status = 'healthy';
      if (consumedPercent > 100) {
        status = 'over';
      } else if (invoicedPercent < 50) {
        status = 'over';
      } else if (invoicedPercent < 100) {
        status = 'warning';
      } else {
        status = 'healthy';
      }

      return {
        id: projectCode,
        name: proj['Name'],
        client: proj['Account'],
        stage: proj['Stage'],
        createdDate: createdDate.toISOString().split('T')[0],
        daysElapsed,
        consumedHours: Math.round(consumedHours * 100) / 100,
        nonBillableHours: Math.round(nonBillableHours * 100) / 100,
        budget: Math.round(budget * 100) / 100,
        budgetSpent: Math.round(budgetSpent * 100) / 100,
        budgetRemaining: Math.round(budgetRemaining * 100) / 100,
        projectValue: Math.round(projectValue * 100) / 100,
        billableAmount: Math.round(billableAmount * 100) / 100,
        invoicedAmount: Math.round(invoicedTotal * 100) / 100,
        revenueAtRisk: Math.round(revenueAtRisk * 100) / 100,
        invoicedPercent: Math.round(invoicedPercent * 10) / 10,
        consumedPercent: Math.round(consumedPercent * 10) / 10,
        dailyBurnRate: Math.round(dailyBurnRate * 100) / 100,
        status
      };
    }).filter(p => p !== null);
  }, [csvData, projectsData, invoiceData]);

  const sortedProjects = useMemo(() => {
    const sorted = [...activeProjects];
    switch(sortBy) {
      case 'consumed-desc':
        return sorted.sort((a, b) => b.consumedPercent - a.consumedPercent);
      case 'consumed-asc':
        return sorted.sort((a, b) => a.consumedPercent - b.consumedPercent);
      case 'revenue-risk':
        return sorted.sort((a, b) => b.revenueAtRisk - a.revenueAtRisk);
      case 'invoiced-asc':
        return sorted.sort((a, b) => a.invoicedPercent - b.invoicedPercent);
      case 'name':
        return sorted.sort((a, b) => a.name.localeCompare(b.name));
      default:
        return sorted;
    }
  }, [activeProjects, sortBy]);

  const burnupChartData = useMemo(() => {
    if (!selectedProject) return [];

    const proj = activeProjects.find(p => p.id === selectedProject);
    if (!proj) return [];

    const createdDate = new Date(proj.createdDate);
    const daysElapsed = proj.daysElapsed;
    
    const data = [];
    const weeksElapsed = Math.ceil(daysElapsed / 7) + 1;
    
    for (let week = 0; week <= weeksElapsed; week++) {
      const weekDate = new Date(createdDate);
      weekDate.setDate(weekDate.getDate() + week * 7);
      
      const projectedBudgetSpent = daysElapsed > 0 ? (proj.budgetSpent / daysElapsed) * (week * 7) : 0;
      
      data.push({
        week,
        date: weekDate.toISOString().split('T')[0],
        spent: projectedBudgetSpent,
        budget: proj.budget
      });
    }
    
    return data;
  }, [selectedProject, activeProjects]);

  const riskProjects = activeProjects.filter(p => p.status !== 'healthy').sort((a, b) => b.revenueAtRisk - a.revenueAtRisk);
  const totalBudget = activeProjects.reduce((sum, p) => sum + p.budget, 0);
  const totalSpent = activeProjects.reduce((sum, p) => sum + p.budgetSpent, 0);
  const totalInvoiced = activeProjects.reduce((sum, p) => sum + p.invoicedAmount, 0);
  const totalRevenueAtRisk = activeProjects.reduce((sum, p) => sum + p.revenueAtRisk, 0);
  const avgConsumption = activeProjects.length > 0 ? Math.round((totalSpent / totalBudget) * 100 * 10) / 10 : 0;

  return (
    <div style={{ padding: '2rem', backgroundColor: 'var(--color-background-tertiary)', minHeight: '100vh', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      <h1 style={{ fontSize: '28px', fontWeight: '500', marginBottom: '1.5rem', color: 'var(--color-text-primary)' }}>
        Project Burn-up Dashboard
      </h1>

      {/* Data Upload Section */}
      <div style={{ 
        backgroundColor: 'var(--color-background-secondary)',
        border: '0.5px solid var(--color-border-tertiary)',
        borderRadius: 'var(--border-radius-lg)',
        padding: '1.5rem',
        marginBottom: '2rem'
      }}>
        <h2 style={{ fontSize: '16px', fontWeight: '500', marginBottom: '1rem' }}>Load Your Data</h2>
        
        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
          <div>
            <label style={{ fontSize: '13px', color: 'var(--color-text-secondary)', display: 'block', marginBottom: '0.5rem' }}>
              Harvest Project List (CSV)
            </label>
            <input 
              type="file" 
              accept=".csv" 
              onChange={handleHarvestUpload}
              style={{ fontSize: '13px' }}
            />
            <p style={{ fontSize: '11px', color: 'var(--color-text-secondary)', margin: '0.5rem 0 0 0' }}>
              Ensure "Project Code" column has P-xxx codes
            </p>
          </div>
          
          <div>
            <label style={{ fontSize: '13px', color: 'var(--color-text-secondary)', display: 'block', marginBottom: '0.5rem' }}>
              Projects File (CSV)
            </label>
            <input 
              type="file" 
              accept=".csv" 
              onChange={handleProjectsUpload}
              style={{ fontSize: '13px' }}
            />
          </div>

          <div>
            <label style={{ fontSize: '13px', color: 'var(--color-text-secondary)', display: 'block', marginBottom: '0.5rem' }}>
              Payments/Invoices (CSV)
            </label>
            <input 
              type="file" 
              accept=".csv" 
              onChange={handleInvoiceUpload}
              style={{ fontSize: '13px' }}
            />
            <p style={{ fontSize: '11px', color: 'var(--color-text-secondary)', margin: '0.5rem 0 0 0' }}>
              Optional: Extracts [P-xxx] from Payment Terms
            </p>
          </div>
        </div>

        {(csvData && projectsData) && (
          <p style={{ fontSize: '13px', color: 'var(--color-text-success)' }}>
            ✓ Data loaded: {activeProjects.length} active projects {invoiceData ? '+ invoices' : ''}
          </p>
        )}
      </div>

      {activeProjects.length === 0 && (csvData || projectsData) && (
        <div style={{
          backgroundColor: 'var(--color-background-secondary)',
          border: '0.5px solid var(--color-border-warning)',
          borderRadius: 'var(--border-radius-lg)',
          padding: '1.5rem',
          marginBottom: '2rem',
          color: 'var(--color-text-warning)'
        }}>
          ⚠️ No projects matched. Verify both CSVs are loaded and "Project Code" matches the "Number" field.
        </div>
      )}

      {activeProjects.length > 0 && (
        <>
          {/* Summary Cards */}
          <div style={{ 
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: '12px',
            marginBottom: '2rem'
          }}>
            <div style={{ 
              backgroundColor: 'var(--color-background-secondary)',
              padding: '1rem',
              borderRadius: 'var(--border-radius-md)',
              border: '0.5px solid var(--color-border-tertiary)'
            }}>
              <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)', margin: '0 0 8px 0' }}>Total Projects</p>
              <p style={{ fontSize: '24px', fontWeight: '500', margin: '0', color: 'var(--color-text-primary)' }}>
                {activeProjects.length}
              </p>
            </div>

            <div style={{ 
              backgroundColor: 'var(--color-background-secondary)',
              padding: '1rem',
              borderRadius: 'var(--border-radius-md)',
              border: '0.5px solid var(--color-border-tertiary)'
            }}>
              <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)', margin: '0 0 8px 0' }}>Total Budget</p>
              <p style={{ fontSize: '24px', fontWeight: '500', margin: '0', color: 'var(--color-text-primary)' }}>
                ${(totalBudget / 1000).toFixed(0)}K
              </p>
            </div>

            <div style={{ 
              backgroundColor: 'var(--color-background-secondary)',
              padding: '1rem',
              borderRadius: 'var(--border-radius-md)',
              border: '0.5px solid var(--color-border-tertiary)'
            }}>
              <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)', margin: '0 0 8px 0' }}>Budget Spent</p>
              <p style={{ fontSize: '24px', fontWeight: '500', margin: '0', color: 'var(--color-text-primary)' }}>
                ${(totalSpent / 1000).toFixed(0)}K
              </p>
            </div>

            <div style={{ 
              backgroundColor: 'var(--color-background-secondary)',
              padding: '1rem',
              borderRadius: 'var(--border-radius-md)',
              border: '0.5px solid var(--color-border-tertiary)'
            }}>
              <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)', margin: '0 0 8px 0' }}>Revenue at Risk</p>
              <p style={{ fontSize: '24px', fontWeight: '500', margin: '0', color: 'var(--color-text-primary)' }}>
                ${(totalRevenueAtRisk / 1000).toFixed(0)}K
              </p>
            </div>

            <div style={{ 
              backgroundColor: 'var(--color-background-secondary)',
              padding: '1rem',
              borderRadius: 'var(--border-radius-md)',
              border: '0.5px solid var(--color-border-tertiary)'
            }}>
              <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)', margin: '0 0 8px 0' }}>At Risk</p>
              <p style={{ fontSize: '24px', fontWeight: '500', margin: '0', color: 'var(--color-text-primary)' }}>
                {riskProjects.length}
              </p>
            </div>
          </div>

          {/* View Tabs */}
          <div style={{ 
            display: 'flex',
            gap: '1rem',
            marginBottom: '2rem',
            borderBottom: '0.5px solid var(--color-border-tertiary)',
            paddingBottom: '1rem'
          }}>
            <button
              onClick={() => setActiveView('overview')}
              style={{
                padding: '8px 16px',
                backgroundColor: activeView === 'overview' ? 'var(--color-background-secondary)' : 'transparent',
                border: activeView === 'overview' ? '0.5px solid var(--color-border-tertiary)' : 'none',
                borderRadius: 'var(--border-radius-md)',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '500',
                color: activeView === 'overview' ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                transition: 'all 0.2s'
              }}
            >
              All Projects Overview
            </button>
            <button
              onClick={() => setActiveView('revenue')}
              style={{
                padding: '8px 16px',
                backgroundColor: activeView === 'revenue' ? 'var(--color-background-secondary)' : 'transparent',
                border: activeView === 'revenue' ? '0.5px solid var(--color-border-tertiary)' : 'none',
                borderRadius: 'var(--border-radius-md)',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '500',
                color: activeView === 'revenue' ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                transition: 'all 0.2s'
              }}
            >
              Revenue at Risk
            </button>
            {riskProjects.length > 0 && (
              <button
                onClick={() => setActiveView('risk')}
                style={{
                  padding: '8px 16px',
                  backgroundColor: activeView === 'risk' ? 'var(--color-background-secondary)' : 'transparent',
                  border: activeView === 'risk' ? '0.5px solid var(--color-border-tertiary)' : 'none',
                  borderRadius: 'var(--border-radius-md)',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: activeView === 'risk' ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                  transition: 'all 0.2s'
                }}
              >
                ⚠️ At Risk ({riskProjects.length})
              </button>
            )}
          </div>

          {/* Overview View */}
          {activeView === 'overview' && (
            <div style={{ 
              backgroundColor: 'var(--color-background-primary)',
              border: '0.5px solid var(--color-border-tertiary)',
              borderRadius: 'var(--border-radius-lg)',
              padding: '1.5rem'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <h2 style={{ fontSize: '16px', fontWeight: '500', margin: '0' }}>All Projects at a Glance</h2>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  style={{ fontSize: '13px', padding: '6px 8px', borderRadius: 'var(--border-radius-md)', border: '0.5px solid var(--color-border-tertiary)' }}
                >
                  <option value="consumed-desc">Highest budget consumption first</option>
                  <option value="revenue-risk">Most revenue at risk</option>
                  <option value="invoiced-asc">Lowest invoiced %</option>
                  <option value="name">Alphabetical</option>
                </select>
              </div>

              <div style={{ 
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                gap: '16px'
              }}>
                {sortedProjects.map(proj => (
                  <div
                    key={proj.id}
                    style={{
                      backgroundColor: 'var(--color-background-secondary)',
                      border: '0.5px solid var(--color-border-tertiary)',
                      borderRadius: 'var(--border-radius-md)',
                      padding: '1rem',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      borderLeft: proj.status === 'over' ? '3px solid var(--color-border-danger)' : 
                                  proj.status === 'warning' ? '3px solid var(--color-border-warning)' : 
                                  '3px solid var(--color-border-success)'
                    }}
                    onMouseOver={(e) => {
                      e.currentTarget.style.backgroundColor = 'var(--color-background-tertiary)';
                      e.currentTarget.style.transform = 'translateY(-2px)';
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.backgroundColor = 'var(--color-background-secondary)';
                      e.currentTarget.style.transform = 'translateY(0)';
                    }}
                  >
                    <p style={{ fontSize: '13px', fontWeight: '500', margin: '0 0 8px 0', color: 'var(--color-text-primary)' }}>
                      {proj.name}
                    </p>
                    <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)', margin: '0 0 12px 0' }}>
                      {proj.client} • {proj.stage}
                    </p>

                    <div style={{ 
                      height: '8px',
                      backgroundColor: 'var(--color-background-tertiary)',
                      borderRadius: '4px',
                      overflow: 'hidden',
                      marginBottom: '8px'
                    }}>
                      <div style={{
                        height: '100%',
                        width: `${Math.min(proj.consumedPercent, 100)}%`,
                        backgroundColor: proj.status === 'over' ? 'var(--color-background-danger)' : 
                                        proj.status === 'warning' ? 'var(--color-background-warning)' : 
                                        'var(--color-background-success)',
                        transition: 'width 0.3s'
                      }} />
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.5rem' }}>
                      <span style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>Budget Spent:</span>
                      <span style={{ fontSize: '14px', fontWeight: '500', color: 'var(--color-text-primary)' }}>
                        {proj.consumedPercent}%
                      </span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                      <span style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>Invoiced:</span>
                      <span style={{ fontSize: '14px', fontWeight: '500', color: proj.status !== 'healthy' ? 'var(--color-text-warning)' : 'var(--color-text-success)' }}>
                        {proj.invoicedPercent}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Revenue at Risk View */}
          {activeView === 'revenue' && (
            <div style={{ 
              backgroundColor: 'var(--color-background-primary)',
              border: '0.5px solid var(--color-border-tertiary)',
              borderRadius: 'var(--border-radius-lg)',
              padding: '1.5rem'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <h2 style={{ fontSize: '16px', fontWeight: '500', margin: '0' }}>Revenue at Risk by Project</h2>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  style={{ fontSize: '13px', padding: '6px 8px', borderRadius: 'var(--border-radius-md)', border: '0.5px solid var(--color-border-tertiary)' }}
                >
                  <option value="revenue-risk">Most revenue at risk</option>
                  <option value="invoiced-asc">Lowest invoiced %</option>
                  <option value="consumed-desc">Highest budget spent</option>
                  <option value="name">Alphabetical</option>
                </select>
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', fontSize: '13px', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '0.5px solid var(--color-border-tertiary)' }}>
                      <th style={{ textAlign: 'left', padding: '12px 0', color: 'var(--color-text-secondary)', fontWeight: '500' }}>Project</th>
                      <th style={{ textAlign: 'left', padding: '12px 0', color: 'var(--color-text-secondary)', fontWeight: '500' }}>Client</th>
                      <th style={{ textAlign: 'right', padding: '12px 0', color: 'var(--color-text-secondary)', fontWeight: '500' }}>Spent</th>
                      <th style={{ textAlign: 'right', padding: '12px 0', color: 'var(--color-text-secondary)', fontWeight: '500' }}>Invoiced</th>
                      <th style={{ textAlign: 'right', padding: '12px 0', color: 'var(--color-text-secondary)', fontWeight: '500' }}>Revenue at Risk</th>
                      <th style={{ textAlign: 'center', padding: '12px 0', color: 'var(--color-text-secondary)', fontWeight: '500' }}>Invoiced %</th>
                      <th style={{ textAlign: 'right', padding: '12px 0', color: 'var(--color-text-secondary)', fontWeight: '500' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedProjects.map(proj => (
                      <tr key={proj.id} style={{ borderBottom: '0.5px solid var(--color-border-tertiary)' }}>
                        <td style={{ padding: '12px 0', color: 'var(--color-text-primary)', fontWeight: '500' }}>{proj.name}</td>
                        <td style={{ padding: '12px 0', color: 'var(--color-text-secondary)' }}>{proj.client}</td>
                        <td style={{ padding: '12px 0', textAlign: 'right', color: 'var(--color-text-primary)' }}>${(proj.budgetSpent / 1000).toFixed(0)}K</td>
                        <td style={{ padding: '12px 0', textAlign: 'right', color: 'var(--color-text-primary)' }}>${(proj.invoicedAmount / 1000).toFixed(0)}K</td>
                        <td style={{ 
                          padding: '12px 0', 
                          textAlign: 'right',
                          color: proj.status !== 'healthy' ? 'var(--color-text-danger)' : 'var(--color-text-success)',
                          fontWeight: '500'
                        }}>
                          ${(proj.revenueAtRisk / 1000).toFixed(0)}K
                        </td>
                        <td style={{ 
                          padding: '12px 0',
                          textAlign: 'center',
                          color: proj.status === 'over' ? 'var(--color-text-danger)' : 
                                 proj.status === 'warning' ? 'var(--color-text-warning)' : 
                                 'var(--color-text-success)',
                          fontWeight: '500'
                        }}>
                          {proj.invoicedPercent}%
                        </td>
                        <td style={{ padding: '12px 0', textAlign: 'right' }}>
                          <span style={{
                            display: 'inline-block',
                            padding: '2px 8px',
                            borderRadius: 'var(--border-radius-md)',
                            fontSize: '11px',
                            fontWeight: '500',
                            backgroundColor: proj.status === 'over' ? 'var(--color-background-danger)' : 
                                           proj.status === 'warning' ? 'var(--color-background-warning)' :
                                           'var(--color-background-success)',
                            color: proj.status === 'over' ? 'var(--color-text-danger)' : 
                                   proj.status === 'warning' ? 'var(--color-text-warning)' :
                                   'var(--color-text-success)'
                          }}>
                            {proj.status === 'over' ? '🔴 Critical' : proj.status === 'warning' ? '🟡 Warning' : '🟢 Healthy'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Risk View */}
          {activeView === 'risk' && riskProjects.length > 0 && (
            <div style={{ 
              backgroundColor: 'var(--color-background-primary)',
              border: '0.5px solid var(--color-border-tertiary)',
              borderRadius: 'var(--border-radius-lg)',
              padding: '1.5rem'
            }}>
              <h2 style={{ fontSize: '16px', fontWeight: '500', marginBottom: '1.5rem' }}>⚠️ Projects at Risk</h2>

              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', fontSize: '13px', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '0.5px solid var(--color-border-tertiary)' }}>
                      <th style={{ textAlign: 'left', padding: '12px 0', color: 'var(--color-text-secondary)', fontWeight: '500' }}>Project</th>
                      <th style={{ textAlign: 'left', padding: '12px 0', color: 'var(--color-text-secondary)', fontWeight: '500' }}>Stage</th>
                      <th style={{ textAlign: 'right', padding: '12px 0', color: 'var(--color-text-secondary)', fontWeight: '500' }}>Spent</th>
                      <th style={{ textAlign: 'right', padding: '12px 0', color: 'var(--color-text-secondary)', fontWeight: '500' }}>Revenue at Risk</th>
                      <th style={{ textAlign: 'center', padding: '12px 0', color: 'var(--color-text-secondary)', fontWeight: '500' }}>Invoiced %</th>
                      <th style={{ textAlign: 'right', padding: '12px 0', color: 'var(--color-text-secondary)', fontWeight: '500' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {riskProjects.map(p => (
                      <tr key={p.id} style={{ borderBottom: '0.5px solid var(--color-border-tertiary)' }}>
                        <td style={{ padding: '12px 0', color: 'var(--color-text-primary)' }}>{p.name}</td>
                        <td style={{ padding: '12px 0', color: 'var(--color-text-secondary)', fontSize: '12px' }}>{p.stage}</td>
                        <td style={{ padding: '12px 0', textAlign: 'right', color: 'var(--color-text-primary)' }}>${(p.budgetSpent / 1000).toFixed(0)}K</td>
                        <td style={{ padding: '12px 0', textAlign: 'right', color: 'var(--color-text-danger)', fontWeight: '500' }}>${(p.revenueAtRisk / 1000).toFixed(0)}K</td>
                        <td style={{ padding: '12px 0', textAlign: 'center', color: p.status === 'over' ? 'var(--color-text-danger)' : 'var(--color-text-warning)', fontWeight: '500' }}>
                          {p.invoicedPercent}%
                        </td>
                        <td style={{ padding: '12px 0', textAlign: 'right' }}>
                          <span style={{
                            display: 'inline-block',
                            padding: '2px 8px',
                            borderRadius: 'var(--border-radius-md)',
                            fontSize: '11px',
                            fontWeight: '500',
                            backgroundColor: p.status === 'over' ? 'var(--color-background-danger)' : 'var(--color-background-warning)',
                            color: p.status === 'over' ? 'var(--color-text-danger)' : 'var(--color-text-warning)'
                          }}>
                            {p.status === 'over' ? '🔴 Critical' : '🟡 Warning'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {!csvData && !projectsData && (
        <div style={{
          textAlign: 'center',
          padding: '3rem 1rem',
          color: 'var(--color-text-secondary)',
          fontSize: '14px'
        }}>
          Upload your CSV files above to get started
        </div>
      )}
    </div>
  );
}
