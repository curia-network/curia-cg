'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { 
  Users, 
  Clock, 
  CheckCircle2, 
  Star, 
  User,
  TrendingUp,
  Zap,
  MoreHorizontal,
  Edit2,
  Copy,
  Trash2
} from 'lucide-react';
import { LockWithStats } from '@/types/locks';
import { UPGatingRequirements, EthereumGatingRequirements } from '@/types/gating';
import { cn } from '@/lib/utils';

interface LockCardProps {
  lock: LockWithStats;
  isSelected?: boolean;
  onSelect: () => void;
  variant?: 'grid' | 'list';
  showCreator?: boolean;
  className?: string;
  // Action handlers (optional)
  onEdit?: (lock: LockWithStats) => void;
  onDuplicate?: (lock: LockWithStats) => void;
  onDelete?: (lock: LockWithStats) => void;
}

export const LockCard: React.FC<LockCardProps> = ({
  lock,
  isSelected = false,
  onSelect,
  variant = 'grid',
  showCreator = true,
  className = '',
  onEdit,
  onDuplicate,
  onDelete
}) => {
  // Format timestamp for display
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);
    
    if (diffInHours < 1) {
      return 'Just now';
    } else if (diffInHours < 24) {
      return `${Math.floor(diffInHours)}h ago`;
    } else if (diffInHours < 168) { // 7 days
      return `${Math.floor(diffInHours / 24)}d ago`;
    } else {
      return date.toLocaleDateString();
    }
  };

  // Extract category types from gating config for display
  const getCategoryTypes = () => {
    if (!lock.gatingConfig?.categories) return [];
    
    return lock.gatingConfig.categories.map(category => {
      switch (category.type) {
        case 'universal_profile':
          return { type: 'Universal Profile', icon: '🔗', color: 'bg-purple-100 text-purple-700' };
        case 'ethereum_profile':
          return { type: 'Ethereum', icon: '⚡', color: 'bg-blue-100 text-blue-700' };
        default:
          return { type: 'Custom', icon: '🔒', color: 'bg-gray-100 text-gray-700' };
      }
    });
  };

  // Get requirements summary
  const getRequirementsSummary = () => {
    if (!lock.gatingConfig?.categories) return 'No requirements';
    
    const requirements: string[] = [];
    
    lock.gatingConfig.categories.forEach(category => {
      if (category.type === 'universal_profile') {
        const req = category.requirements as UPGatingRequirements;
        
        if (req.minLyxBalance && req.minLyxBalance !== '0') {
          const lyx = parseFloat(req.minLyxBalance) / 1e18;
          requirements.push(`${lyx.toFixed(0)} LYX`);
        }
        
        if (req.requiredTokens && req.requiredTokens.length > 0) {
          requirements.push(`${req.requiredTokens.length} token${req.requiredTokens.length > 1 ? 's' : ''}`);
        }
        
        if (req.followerRequirements && req.followerRequirements.length > 0) {
          requirements.push('Social following');
        }
      } else if (category.type === 'ethereum_profile') {
        const req = category.requirements as EthereumGatingRequirements;
        
        if (req.requiresENS) {
          requirements.push('ENS required');
        }
        
        if (req.minimumETHBalance && req.minimumETHBalance !== '0') {
          const eth = parseFloat(req.minimumETHBalance) / 1e18;
          requirements.push(`${eth.toFixed(3)} ETH`);
        }
        
        if (req.requiredERC20Tokens && req.requiredERC20Tokens.length > 0) {
          requirements.push(`${req.requiredERC20Tokens.length} ERC20`);
        }
        
        if (req.requiredERC721Collections && req.requiredERC721Collections.length > 0) {
          requirements.push(`${req.requiredERC721Collections.length} NFT${req.requiredERC721Collections.length > 1 ? 's' : ''}`);
        }
        
        if (req.efpRequirements && req.efpRequirements.length > 0) {
          requirements.push('EFP social');
        }
      }
    });
    
    if (requirements.length === 0) return 'Custom requirements';
    if (requirements.length <= 2) return requirements.join(' + ');
    return `${requirements.slice(0, 2).join(' + ')} +${requirements.length - 2} more`;
  };

  const categoryTypes = getCategoryTypes();
  const requirementsSummary = getRequirementsSummary();

  // Action menu component with proper permissions
  const ActionMenu = () => {
    // Determine what actions are available
    const canEdit = lock.canEdit && onEdit; // Only admins and owners can edit
    const canDelete = lock.canDelete && onDelete; // Only admins and owners can delete
    const canDuplicate = onDuplicate; // Any authenticated user can duplicate
    
    // Show menu if any action is available
    if (!canEdit && !canDelete && !canDuplicate) {
      return null;
    }

    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button 
            variant="ghost" 
            size="sm" 
            className="opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={(e) => e.stopPropagation()} // Prevent card selection
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
          {canEdit && (
            <DropdownMenuItem onClick={() => onEdit(lock)}>
              <Edit2 className="h-4 w-4 mr-2" />
              Edit Lock
            </DropdownMenuItem>
          )}
          {canDuplicate && (
            <DropdownMenuItem onClick={() => onDuplicate(lock)}>
              <Copy className="h-4 w-4 mr-2" />
              Duplicate
            </DropdownMenuItem>
          )}
          {canDelete && (
            <DropdownMenuItem 
              onClick={() => onDelete(lock)}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  if (variant === 'list') {
    return (
      <Card 
        className={cn(
          'group cursor-pointer transition-all hover:shadow-md min-w-0',
          isSelected && 'ring-2 ring-primary bg-primary/5',
          className
        )}
        onClick={onSelect}
      >
        <CardContent className="p-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center space-x-4 flex-1 min-w-0">
              {/* Icon */}
              <div 
                className={cn(
                  'w-10 h-10 rounded-lg flex items-center justify-center text-lg flex-shrink-0',
                  isSelected ? 'bg-primary text-primary-foreground' : 'bg-muted'
                )}
                style={{ backgroundColor: lock.color }}
              >
                {lock.icon}
              </div>
              
              {/* Main Content */}
              <div className="flex-1 min-w-0 max-w-48 sm:max-w-64 md:max-w-80">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-semibold tracking-tight truncate flex-1" title={lock.name}>{lock.name}</h3>
                  {/* Status badges - always visible on the right */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {lock.isTemplate && <Star className="h-3 w-3 text-yellow-500" />}
                    {isSelected && <CheckCircle2 className="h-4 w-4 text-primary" />}
                  </div>
                </div>
                
                <p className="text-sm text-muted-foreground truncate" title={requirementsSummary}>{requirementsSummary}</p>
                
                <div className="flex items-center flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-muted-foreground">
                  <div className="flex items-center space-x-1">
                    <Users className="h-3 w-3" />
                    <span>{lock.usageCount} use{lock.usageCount !== 1 ? 's' : ''}</span>
                  </div>
                  
                  <div className="flex items-center space-x-1">
                    <Clock className="h-3 w-3" />
                    <span>{formatDate(lock.createdAt)}</span>
                  </div>
                  
                  {showCreator && (
                    <div className="flex items-center space-x-1 min-w-0">
                      <User className="h-3 w-3 flex-shrink-0" />
                      <span className="truncate">
                        {lock.isOwned ? 'You' : 'Community member'}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
            
            {/* Action Menu and Category Badges */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <div className="hidden sm:flex items-center gap-1">
                {categoryTypes.slice(0, 2).map((cat, index) => (
                  <Badge key={index} variant="secondary" className={cn('text-xs whitespace-nowrap', cat.color)}>
                    <span className="mr-1">{cat.icon}</span>
                    <span className="hidden md:inline">{cat.type}</span>
                  </Badge>
                ))}
                {categoryTypes.length > 2 && (
                  <Badge variant="secondary" className="text-xs">
                    +{categoryTypes.length - 2}
                  </Badge>
                )}
              </div>
              <ActionMenu />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card 
      className={cn(
        'group cursor-pointer transition-all hover:shadow-md min-w-0',
        isSelected && 'ring-2 ring-primary bg-primary/5',
        className
      )}
      onClick={onSelect}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center space-x-3 min-w-0">
            <div 
              className={cn(
                'w-8 h-8 rounded-lg flex items-center justify-center text-sm flex-shrink-0',
                isSelected ? 'bg-primary text-primary-foreground' : 'bg-muted'
              )}
              style={{ backgroundColor: lock.color }}
            >
              {lock.icon}
            </div>
            
            <div className="min-w-0 flex-1">
              <div className="flex items-center space-x-2">
                <CardTitle className="text-sm font-semibold tracking-tight truncate" title={lock.name}>{lock.name}</CardTitle>
                {isSelected && <CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0" />}
              </div>
              
              <div className="flex items-center space-x-1 mt-1">
                {lock.isTemplate && (
                  <Badge variant="outline" className="text-xs">
                    <Star className="h-2 w-2 mr-1" />
                    Template
                  </Badge>
                )}

              </div>
            </div>
          </div>
          
          {/* Action Menu */}
          <div className="flex-shrink-0">
            <ActionMenu />
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="pt-0">
        {/* Description */}
        {lock.description && (
          <p className="text-sm text-muted-foreground mb-3 line-clamp-2" title={lock.description}>
            {lock.description}
          </p>
        )}
        
        {/* Requirements Summary */}
        <div className="mb-3">
          <p className="text-sm font-medium mb-1">Requirements:</p>
          <p className="text-xs text-muted-foreground truncate" title={requirementsSummary}>{requirementsSummary}</p>
        </div>
        
        {/* Category Types */}
        <div className="flex flex-wrap gap-1 mb-3">
          {categoryTypes.map((cat, index) => (
            <Badge key={index} variant="secondary" className={cn('text-xs', cat.color)}>
              <span className="mr-1">{cat.icon}</span>
              {cat.type}
            </Badge>
          ))}
        </div>
        
        {/* Stats */}
        <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
          <div className="flex items-center space-x-1">
            <Users className="h-3 w-3" />
            <span>{lock.usageCount} use{lock.usageCount !== 1 ? 's' : ''}</span>
          </div>
          
          <div className="flex items-center space-x-1">
            <Clock className="h-3 w-3" />
            <span>{formatDate(lock.createdAt)}</span>
          </div>
          
          {lock.successRate > 0 && (
            <div className="flex items-center space-x-1">
              <TrendingUp className="h-3 w-3" />
              <span>{(lock.successRate * 100).toFixed(0)}% success</span>
            </div>
          )}
          
          {lock.avgVerificationTime > 0 && (
            <div className="flex items-center space-x-1">
              <Zap className="h-3 w-3" />
              <span>{(lock.avgVerificationTime / 1000).toFixed(1)}s avg</span>
            </div>
          )}
        </div>
        
        {/* Creator */}
        {showCreator && (
          <div className="flex items-center space-x-1 mt-2 pt-2 border-t text-xs text-muted-foreground min-w-0">
            <User className="h-3 w-3 flex-shrink-0" />
            <span className="truncate">
              Created by {lock.isOwned ? 'you' : 'community member'}
            </span>
          </div>
        )}
        
        {/* Tags */}
        {lock.tags && lock.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2 pt-2 border-t">
            {lock.tags
              .filter(tag => !['migrated', 'auto-generated'].includes(tag))
              .slice(0, 3)
              .map((tag, index) => (
                <Badge key={index} variant="outline" className="text-xs">
                  {tag}
                </Badge>
              ))}
            {lock.tags.filter(tag => !['migrated', 'auto-generated'].includes(tag)).length > 3 && (
              <Badge variant="outline" className="text-xs">
                +{lock.tags.filter(tag => !['migrated', 'auto-generated'].includes(tag)).length - 3} more
              </Badge>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}; 