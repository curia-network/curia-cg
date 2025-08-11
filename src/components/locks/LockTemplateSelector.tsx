'use client';

import React, { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Clock, Users, Sparkles, Upload } from 'lucide-react';
import { cn } from '@/lib/utils';

import { LockTemplate, TemplateCategory, TemplateDifficulty, TemplateSearchFilters } from '@/types/templates';
import { LOCK_TEMPLATES, TEMPLATE_CATEGORIES, DIFFICULTY_LEVELS } from '@/data/lockTemplates';

interface LockTemplateSelectorProps {
  onSelectTemplate: (template: LockTemplate) => void;
  onStartFromScratch: () => void;
  onUploadCSV: () => void;
  selectedTemplate?: LockTemplate | null;
}

export const LockTemplateSelector: React.FC<LockTemplateSelectorProps> = ({
  onSelectTemplate,
  onStartFromScratch,
  onUploadCSV,
  selectedTemplate
}) => {
  const [filters, setFilters] = useState<TemplateSearchFilters>({
    sortBy: 'popular'
  });

  // Filter and sort templates
  const filteredTemplates = useMemo(() => {
    let filtered = LOCK_TEMPLATES;

    // Apply category filter
    if (filters.category) {
      filtered = filtered.filter(template => template.category === filters.category);
    }

    // Apply difficulty filter
    if (filters.difficulty) {
      filtered = filtered.filter(template => template.difficulty === filters.difficulty);
    }

    // Apply search filter
    if (filters.searchTerm) {
      const searchLower = filters.searchTerm.toLowerCase();
      filtered = filtered.filter(template =>
        template.name.toLowerCase().includes(searchLower) ||
        template.description.toLowerCase().includes(searchLower) ||
        template.tags.some(tag => tag.toLowerCase().includes(searchLower))
      );
    }

    // Apply sorting
    switch (filters.sortBy) {
      case 'popular':
        filtered.sort((a, b) => b.usageCount - a.usageCount);
        break;
      case 'recent':
        filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        break;
      case 'name':
        filtered.sort((a, b) => a.name.localeCompare(b.name));
        break;
    }

    return filtered;
  }, [filters]);

  const updateFilters = (updates: Partial<TemplateSearchFilters>) => {
    setFilters(prev => ({ ...prev, ...updates }));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <div className="h-16 w-16 mx-auto bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl flex items-center justify-center mb-4">
          <Sparkles className="h-8 w-8 text-white" />
        </div>
        <h2 className="text-2xl font-bold mb-2">Choose Your Starting Point</h2>
        <p className="text-muted-foreground">
          Select a template to get started quickly, or build from scratch
        </p>
      </div>

      {/* Quick Actions */}
      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <Button
          variant="outline"
          onClick={onUploadCSV}
          className="flex items-center justify-center"
        >
          <Upload className="h-4 w-4 mr-2" />
          Upload CSV
          <Badge variant="secondary" className="ml-2 text-xs">LUKSO only</Badge>
        </Button>
        <Button
          variant="outline"
          onClick={onStartFromScratch}
          className="flex items-center justify-center"
        >
          <span className="mr-2">⚡</span>
          Start from Scratch
        </Button>
        <Button
          variant={selectedTemplate ? 'default' : 'outline'}
          disabled={!selectedTemplate}
          className="flex items-center justify-center"
        >
          <span className="mr-2">🚀</span>
          {selectedTemplate ? `Use "${selectedTemplate.name}"` : 'Select Template'}
        </Button>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4 bg-muted/50 rounded-lg">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search templates..."
            value={filters.searchTerm || ''}
            onChange={(e) => updateFilters({ searchTerm: e.target.value })}
            className="pl-10"
          />
        </div>

        {/* Category Filter */}
        <Select
          value={filters.category || 'all'}
          onValueChange={(value) => updateFilters({ category: value === 'all' ? undefined : value as TemplateCategory })}
        >
          <SelectTrigger>
            <SelectValue placeholder="All Categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {Object.entries(TEMPLATE_CATEGORIES).map(([key, category]) => (
              <SelectItem key={key} value={key}>
                {category.icon} {category.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Difficulty Filter */}
        <Select
          value={filters.difficulty || 'all'}
          onValueChange={(value) => updateFilters({ difficulty: value === 'all' ? undefined : value as TemplateDifficulty })}
        >
          <SelectTrigger>
            <SelectValue placeholder="All Levels" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Levels</SelectItem>
            {Object.entries(DIFFICULTY_LEVELS).map(([key, level]) => (
              <SelectItem key={key} value={key}>
                {level.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Sort */}
        <Select
          value={filters.sortBy || 'popular'}
          onValueChange={(value) => updateFilters({ sortBy: value as TemplateSearchFilters['sortBy'] })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="popular">Most Popular</SelectItem>
            <SelectItem value="recent">Most Recent</SelectItem>
            <SelectItem value="name">Alphabetical</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Templates List */}
      <div className="space-y-2">
        {filteredTemplates.map((template) => (
          <div
            key={template.id}
            className={cn(
              'flex items-center justify-between p-4 rounded-lg border cursor-pointer transition-all hover:shadow-sm hover:bg-muted/50',
              selectedTemplate?.id === template.id && 'ring-2 ring-primary bg-primary/5'
            )}
            onClick={() => onSelectTemplate(template)}
          >
            {/* Left: Icon, Name, Description */}
            <div className="flex items-center space-x-4 flex-1 min-w-0">
              <span className="text-2xl flex-shrink-0">{template.icon}</span>
              
              <div className="flex-1 min-w-0">
                <div className="flex items-center space-x-2 mb-1">
                  <h3 className="font-semibold text-sm truncate">{template.name}</h3>
                  <Badge
                    variant="secondary"
                    className={cn(
                      'text-xs px-2 py-0',
                      DIFFICULTY_LEVELS[template.difficulty].color,
                      'text-white'
                    )}
                  >
                    {DIFFICULTY_LEVELS[template.difficulty].name}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground truncate">
                  {template.description}
                </p>
              </div>
            </div>

            {/* Right: Stats and Category */}
            <div className="flex items-center space-x-4 flex-shrink-0">
              <div className="hidden sm:flex items-center space-x-3 text-xs text-muted-foreground">
                <div className="flex items-center space-x-1">
                  <Clock className="h-3 w-3" />
                  <span>{template.estimatedSetupTime}</span>
                </div>
                <div className="flex items-center space-x-1">
                  <Users className="h-3 w-3" />
                  <span>{template.usageCount.toLocaleString()}</span>
                </div>
              </div>
              
              <Badge variant="outline" className="text-xs hidden md:flex">
                {TEMPLATE_CATEGORIES[template.category].icon} {TEMPLATE_CATEGORIES[template.category].name}
              </Badge>
              
              {/* Mobile stats */}
              <div className="sm:hidden text-xs text-muted-foreground">
                {template.usageCount.toLocaleString()}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* No Results */}
      {filteredTemplates.length === 0 && (
        <div className="text-center py-12">
          <div className="h-12 w-12 mx-auto bg-muted rounded-lg flex items-center justify-center mb-4">
            <Search className="h-6 w-6 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold mb-2">No templates found</h3>
          <p className="text-muted-foreground mb-4">
            Try adjusting your search or filters
          </p>
          <Button
            variant="outline"
            onClick={() => setFilters({ sortBy: 'popular' })}
          >
            Clear Filters
          </Button>
        </div>
      )}
    </div>
  );
}; 