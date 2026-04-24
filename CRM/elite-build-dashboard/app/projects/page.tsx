"use client";
import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { db } from '@/lib/firebase';
import {
  collection, addDoc, deleteDoc, doc, updateDoc, Timestamp, orderBy,
} from 'firebase/firestore';
import { geocodeAddress } from '@/lib/utils/geocode';
import { Trash2, LayoutGrid, Database, Boxes, Megaphone } from 'lucide-react';
import { useFirestoreCollection } from '@/lib/hooks/useFirestoreCollection';
import { useToast } from '@/lib/hooks/useToast';
import { useAuth } from '@/lib/context/AuthContext';
import { Project, PropertyType, ProjectStatus, PROPERTY_TYPES, PROJECT_STATUSES } from '@/lib/types/project';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { MultiImageUpload } from '@/components/ui/MultiImageUpload';
import { LocationAutocomplete } from '@/components/ui/LocationAutocomplete';
import { ProjectSidebar } from '@/components/projects/ProjectSidebar';
import { ProjectOverviewTab } from '@/components/projects/ProjectOverviewTab';
import { ProjectSchemaTab } from '@/components/projects/ProjectSchemaTab';
import { ProjectUnitsTab } from '@/components/projects/ProjectUnitsTab';
import { ProjectCampaignsTab } from '@/components/projects/ProjectCampaignsTab';
import { can } from '@/lib/utils/permissions';

type DetailTab = 'overview' | 'schema' | 'units' | 'campaigns';

const ALL_DETAIL_TABS: { id: DetailTab; label: string; icon: typeof LayoutGrid }[] = [
  { id: 'overview', label: 'Overview', icon: LayoutGrid },
  { id: 'schema', label: 'Schema', icon: Database },
  { id: 'units', label: 'Units', icon: Boxes },
  { id: 'campaigns', label: 'Campaigns', icon: Megaphone },
];

export default function UnifiedProjectsPage() {
  const searchParams = useSearchParams();
  const { data: projects, loading } = useFirestoreCollection<Project>(
    'projects',
    orderBy('created_at', 'desc'),
  );
  const { showToast } = useToast();
  const { crmUser } = useAuth();
  // Who can do what on this page.
  const canEditCore = can(crmUser?.role, 'edit_project_core');
  const canTagCampaigns = can(crmUser?.role, 'tag_project_campaigns');
  // Digital-marketing users only see the Campaigns tab.
  const DETAIL_TABS = canEditCore
    ? ALL_DETAIL_TABS
    : ALL_DETAIL_TABS.filter(t => t.id === 'campaigns');

  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [activeTab, setActiveTab] = useState<DetailTab>(canEditCore ? 'overview' : 'campaigns');

  // Auto-select project from query param (e.g., /projects?id=abc123)
  useEffect(() => {
    const projectId = searchParams.get('id');
    if (projectId && projects.length > 0 && !selectedProject) {
      const target = projects.find(p => p.id === projectId);
      if (target) setSelectedProject(target);
    }
  }, [searchParams, projects, selectedProject]);

  // Add Project modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [formName, setFormName] = useState('');
  const [formBuilder, setFormBuilder] = useState('');
  const [formLocation, setFormLocation] = useState('');
  const [formType, setFormType] = useState<PropertyType>('Plotted Land');
  const [formStatus, setFormStatus] = useState<ProjectStatus>('Active');
  const [formImages, setFormImages] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  // Delete Project
  const [deleteConfirm, setDeleteConfirm] = useState<Project | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Keep selectedProject in sync with real-time data
  const currentProject = selectedProject
    ? projects.find(p => p.id === selectedProject.id) || selectedProject
    : null;

  const handleSelectProject = (project: Project) => {
    setSelectedProject(project);
    setActiveTab('overview');
  };

  const resetForm = () => {
    setFormName('');
    setFormBuilder('');
    setFormLocation('');
    setFormType('Plotted Land');
    setFormStatus('Active');
    setFormImages([]);
  };

  const handleAddProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim() || !formBuilder.trim() || !formLocation.trim()) {
      showToast('error', 'Please fill all required fields.');
      return;
    }
    setSaving(true);
    try {
      const heroImage = formImages[0] || null;
      const gallery = formImages.slice(1);
      const docRef = await addDoc(collection(db, 'projects'), {
        name: formName.trim(),
        builder: formBuilder.trim(),
        location: formLocation.trim(),
        propertyType: formType,
        status: formStatus,
        heroImage,
        gallery,
        totalUnits: 0,
        priceRange: null,
        created_at: Timestamp.now(),
        updated_at: Timestamp.now(),
      });
      showToast('success', `Project "${formName}" created.`);
      setShowAddModal(false);
      resetForm();
      // Geocode in background
      geocodeAddress(formLocation.trim()).then(geo => {
        if (geo) updateDoc(doc(db, 'projects', docRef.id), { geo }).catch(() => {});
      });
    } catch (err) {
      console.error(err);
      showToast('error', 'Failed to create project.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteProject = async () => {
    if (!deleteConfirm) return;
    setDeleting(true);
    try {
      await deleteDoc(doc(db, 'projects', deleteConfirm.id));
      if (selectedProject?.id === deleteConfirm.id) setSelectedProject(null);
      showToast('success', `Project "${deleteConfirm.name}" deleted.`);
      setDeleteConfirm(null);
    } catch (err) {
      console.error(err);
      showToast('error', 'Failed to delete project.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <PageHeader title="Projects" subtitle={`${projects.length} projects`} />

      <div className="flex flex-1 flex-col gap-4 overflow-hidden pt-4 md:flex-row">
        <ProjectSidebar
          projects={projects}
          selectedId={currentProject?.id || null}
          onSelect={handleSelectProject}
          onAddProject={() => { resetForm(); setShowAddModal(true); }}
          isAdmin={canEditCore}
          loading={loading}
        />

        <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {!currentProject ? (
            <div className="app-shell-panel flex flex-1 flex-col items-center justify-center text-center">
              <Boxes className="w-16 h-16 text-mn-border mb-4" />
              <p className="font-bold text-lg text-mn-text-muted">Select a project to view details</p>
              <p className="text-xs text-mn-text-muted/60 mt-1">Or create a new one to get started</p>
            </div>
          ) : (
            <>
              <div className="app-shell-panel px-4 pb-0 pt-4 sm:px-6">
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="section-heading">Project workspace</p>
                    <h2 className="mt-2 text-xl font-black text-mn-h1">{currentProject.name}</h2>
                    <p className="mt-1 text-xs text-mn-text-muted">{currentProject.builder} · {currentProject.location}</p>
                  </div>
                  {canEditCore && (
                    <button
                      onClick={() => setDeleteConfirm(currentProject)}
                      className="flex items-center gap-1.5 rounded-xl border border-mn-danger/20 px-3 py-2 text-xs font-bold text-mn-danger/70 transition-colors hover:border-mn-danger/35 hover:bg-mn-danger/8 hover:text-mn-danger"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Delete
                    </button>
                  )}
                </div>
                <div className="mn-segmented flex gap-1 overflow-x-auto rounded-[1.2rem] p-1.5">
                  {DETAIL_TABS.map(tab => {
                    const Icon = tab.icon;
                    return (
                      <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                          className={`flex flex-shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition-all ${
                          activeTab === tab.id
                            ? 'mn-segmented-active'
                            : 'mn-segmented-idle'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                        {tab.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-1 py-4 sm:px-2 sm:py-6">
                {activeTab === 'overview' && canEditCore && (
                  <ProjectOverviewTab project={currentProject} isAdmin={canEditCore} />
                )}
                {activeTab === 'schema' && canEditCore && (
                  <ProjectSchemaTab project={currentProject} isAdmin={canEditCore} />
                )}
                {activeTab === 'units' && canEditCore && (
                  <ProjectUnitsTab project={currentProject} isAdmin={canEditCore} />
                )}
                {activeTab === 'campaigns' && (
                  <ProjectCampaignsTab project={currentProject} canEdit={canTagCampaigns} />
                )}
              </div>
            </>
          )}
        </main>
      </div>

      {/* Add Project Modal */}
      <Modal
        open={showAddModal}
        onClose={() => { setShowAddModal(false); resetForm(); }}
        title="Add Project"
      >
        <form onSubmit={handleAddProject} className="space-y-5">
          <Input
            label="Project Name"
            required
            value={formName}
            onChange={e => setFormName(e.target.value)}
            placeholder="e.g. Rare Earth Phase 2"
          />
          <Input
            label="Builder"
            required
            value={formBuilder}
            onChange={e => setFormBuilder(e.target.value)}
            placeholder="e.g. Sunpure Homes"
          />
          <LocationAutocomplete
            label="Location"
            required
            value={formLocation}
            onChange={setFormLocation}
            placeholder="e.g. Mysore Road, Bangalore"
          />
          <MultiImageUpload
            label="Project Images"
            images={formImages}
            onChange={setFormImages}
            folder="projects"
          />
          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Property Type"
              required
              value={formType}
              onChange={e => setFormType(e.target.value as PropertyType)}
              options={PROPERTY_TYPES.map(t => ({ value: t, label: t }))}
            />
            <Select
              label="Status"
              required
              value={formStatus}
              onChange={e => setFormStatus(e.target.value as ProjectStatus)}
              options={PROJECT_STATUSES.map(s => ({ value: s, label: s }))}
            />
          </div>
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="secondary" className="flex-1" onClick={() => { setShowAddModal(false); resetForm(); }}>
              Cancel
            </Button>
            <Button type="submit" className="flex-1" disabled={saving}>
              {saving ? 'Creating...' : 'Create Project'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        open={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        title="Delete Project"
      >
        <div className="space-y-4">
          <p className="text-sm text-mn-text">
            Are you sure you want to delete <strong>{deleteConfirm?.name}</strong>? This will not delete associated inventory units.
          </p>
          <div className="flex gap-3">
            <Button type="button" variant="secondary" className="flex-1" onClick={() => setDeleteConfirm(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              className="flex-1 !bg-mn-danger hover:!bg-mn-danger/90"
              onClick={handleDeleteProject}
              disabled={deleting}
            >
              {deleting ? 'Deleting...' : 'Delete Project'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
