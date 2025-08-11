'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Edit3, 
  Trash2, 
  Coins,
  Image as ImageIcon,
  Users,
  UserCheck,
  Wallet,
  Globe
} from 'lucide-react';
import { cn } from '@/lib/utils';

import { GatingRequirement } from '@/types/locks';
import { UPTokenMetadata, UPSocialProfile } from '@/lib/upProfile';

interface RequirementCardProps {
  requirement: GatingRequirement;
  tokenMetadata?: UPTokenMetadata;
  socialProfile?: UPSocialProfile;
  isLoading?: boolean;
  onEdit?: (requirement: GatingRequirement) => void;
  onDelete?: (requirement: GatingRequirement) => void;
}

export const RequirementCard: React.FC<RequirementCardProps> = ({
  requirement,
  tokenMetadata,
  socialProfile,
  isLoading = false,
  onEdit,
  onDelete
}) => {
  const handleEdit = () => onEdit?.(requirement);
  const handleDelete = () => onDelete?.(requirement);

  // Helper to format amounts with proper decimals
  const formatAmount = (amount: string, decimals?: number, symbol?: string) => {
    if (!amount) return '0';
    
    // For very small amounts that are likely 1 wei representing 1 token
    if (decimals && decimals > 0) {
      const numAmount = parseFloat(amount);
      if (numAmount === 1 && decimals >= 18) {
        return `1 ${symbol || ''}`.trim();
      }
      // Handle proper decimal formatting
      const formatted = (numAmount / Math.pow(10, decimals)).toString();
      return `${formatted} ${symbol || ''}`.trim();
    }
    
    return `${amount} ${symbol || ''}`.trim();
  };

  // Helper to truncate addresses
  const truncateAddress = (address: string) => {
    if (!address) return '';
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  // Render different card types based on requirement type
  if (requirement.type === 'lyx_balance') {
    const config = requirement.config as any; // eslint-disable-line @typescript-eslint/no-explicit-any
    const amount = config.minAmount || '0';
    const formatted = (parseFloat(amount) / 1e18).toString();
    
    return (
      <div className="flex items-center gap-3 p-4 border rounded-lg bg-card hover:bg-muted/50 transition-colors">
        <div className="flex-shrink-0">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
            <Wallet className="h-5 w-5 text-white" />
          </div>
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium">LYX Balance</span>
            <Badge variant="outline" className="text-xs">Native</Badge>
          </div>
          <div className="text-sm text-muted-foreground mt-1">
            Require: ≥ {formatted} LYX
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {onEdit && (
            <Button variant="ghost" size="sm" onClick={handleEdit} className="h-8 w-8 p-0">
              <Edit3 className="h-4 w-4" />
            </Button>
          )}
          {onDelete && (
            <Button variant="ghost" size="sm" onClick={handleDelete} className="h-8 w-8 p-0 text-destructive hover:text-destructive">
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    );
  }

  if (requirement.type === 'lsp7_token' || requirement.type === 'lsp8_nft') {
    const isLSP8 = requirement.type === 'lsp8_nft';
    const config = requirement.config as any; // eslint-disable-line @typescript-eslint/no-explicit-any
    const contractAddress = config.contractAddress;
    const minAmount = config.minAmount || '0';
    const tokenId = config.tokenId; // For specific LSP8 tokens
    const name = tokenMetadata?.name || config.name || 'Unknown Token';
    const symbol = tokenMetadata?.symbol || config.symbol || 'UNK';
    const decimals = tokenMetadata?.decimals ?? config.decimals;
    const iconUrl = tokenMetadata?.iconUrl;
    
    return (
      <div className="flex items-center gap-3 p-4 border rounded-lg bg-card hover:bg-muted/50 transition-colors">
        <div className="flex-shrink-0">
          {isLoading ? (
            <Skeleton className="w-10 h-10 rounded-full" />
          ) : iconUrl ? (
            <img 
              src={iconUrl} 
              alt={name}
              className="w-10 h-10 rounded-full object-cover border"
              onError={(e) => {
                // Fallback to icon if image fails to load
                const target = e.target as HTMLImageElement;
                target.style.display = 'none';
                target.nextElementSibling?.classList.remove('hidden');
              }}
            />
          ) : null}
          <div className={cn(
            "w-10 h-10 rounded-full flex items-center justify-center",
            iconUrl ? "hidden" : "",
            isLSP8 ? "bg-gradient-to-br from-purple-500 to-pink-600" : "bg-gradient-to-br from-yellow-500 to-orange-600"
          )}>
            {isLSP8 ? (
              <ImageIcon className="h-5 w-5 text-white" />
            ) : (
              <Coins className="h-5 w-5 text-white" />
            )}
          </div>
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium truncate">{name}</span>
            <Badge variant="outline" className="text-xs">
              {isLSP8 ? 'LSP8' : 'LSP7'}
            </Badge>
            {!requirement.isValid && (
              <Badge variant="destructive" className="text-xs">
                Invalid
              </Badge>
            )}
          </div>
          <div className="text-sm text-muted-foreground mt-1">
            <div>
              {isLSP8 && tokenId ? (
                `Require: Token #${tokenId}`
              ) : (
                `Require: ${formatAmount(minAmount, decimals, symbol)}`
              )}
            </div>
            {contractAddress && (
              <div className="text-xs">
                Contract: {truncateAddress(contractAddress)}
              </div>
            )}
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {onEdit && (
            <Button variant="ghost" size="sm" onClick={handleEdit} className="h-8 w-8 p-0">
              <Edit3 className="h-4 w-4" />
            </Button>
          )}
          {onDelete && (
            <Button variant="ghost" size="sm" onClick={handleDelete} className="h-8 w-8 p-0 text-destructive hover:text-destructive">
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    );
  }

  if (requirement.type === 'up_follower_count') {
    const config = requirement.config as any; // eslint-disable-line @typescript-eslint/no-explicit-any
    const minCount = config.minCount || 0;
    
    return (
      <div className="flex items-center gap-3 p-4 border rounded-lg bg-card hover:bg-muted/50 transition-colors">
        <div className="flex-shrink-0">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-green-500 to-teal-600 flex items-center justify-center">
            <Users className="h-5 w-5 text-white" />
          </div>
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium">Minimum Followers</span>
            <Badge variant="outline" className="text-xs">Social</Badge>
          </div>
          <div className="text-sm text-muted-foreground mt-1">
            Require: ≥ {minCount.toLocaleString()} followers
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {onEdit && (
            <Button variant="ghost" size="sm" onClick={handleEdit} className="h-8 w-8 p-0">
              <Edit3 className="h-4 w-4" />
            </Button>
          )}
          {onDelete && (
            <Button variant="ghost" size="sm" onClick={handleDelete} className="h-8 w-8 p-0 text-destructive hover:text-destructive">
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    );
  }

  if (requirement.type === 'up_must_follow' || requirement.type === 'up_must_be_followed_by') {
    const isFollow = requirement.type === 'up_must_follow';
    const config = requirement.config as any; // eslint-disable-line @typescript-eslint/no-explicit-any
    const address = config.address;
    const profileName = config.profileName || socialProfile?.username;
    const profilePicture = socialProfile?.profileImage;
    
    return (
      <div className="flex items-center gap-3 p-4 border rounded-lg bg-card hover:bg-muted/50 transition-colors">
        <div className="flex-shrink-0">
          {isLoading ? (
            <Skeleton className="w-10 h-10 rounded-full" />
          ) : profilePicture ? (
            <img 
              src={profilePicture} 
              alt={profileName || 'Profile'}
              className="w-10 h-10 rounded-full object-cover border"
              onError={(e) => {
                // Fallback to icon if image fails to load
                const target = e.target as HTMLImageElement;
                target.style.display = 'none';
                target.nextElementSibling?.classList.remove('hidden');
              }}
            />
          ) : null}
          <div className={cn(
            "w-10 h-10 rounded-full bg-gradient-to-br from-green-500 to-blue-600 flex items-center justify-center",
            profilePicture ? "hidden" : ""
          )}>
            <UserCheck className="h-5 w-5 text-white" />
          </div>
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium">
              {isFollow ? 'Must Follow' : 'Must Be Followed By'}
            </span>
            <Badge variant="outline" className="text-xs">Social</Badge>
          </div>
          <div className="text-sm text-muted-foreground mt-1">
            <div className="truncate">
              {profileName || 'Unknown Profile'}
            </div>
            {address && (
              <div className="text-xs">
                {truncateAddress(address)}
              </div>
            )}
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {onEdit && (
            <Button variant="ghost" size="sm" onClick={handleEdit} className="h-8 w-8 p-0">
              <Edit3 className="h-4 w-4" />
            </Button>
          )}
          {onDelete && (
            <Button variant="ghost" size="sm" onClick={handleDelete} className="h-8 w-8 p-0 text-destructive hover:text-destructive">
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    );
  }

  // Fallback for other requirement types
  return (
    <div className="flex items-center gap-3 p-4 border rounded-lg bg-card hover:bg-muted/50 transition-colors">
      <div className="flex-shrink-0">
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-gray-500 to-gray-600 flex items-center justify-center">
          <Globe className="h-5 w-5 text-white" />
        </div>
      </div>
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium">{requirement.displayName || requirement.type.replace(/_/g, ' ')}</span>
          <Badge variant="outline" className="text-xs">
            {requirement.category}
          </Badge>
        </div>
        <div className="text-sm text-muted-foreground mt-1">
          {requirement.type}
        </div>
      </div>
      
      <div className="flex items-center gap-2">
        {onEdit && (
          <Button variant="ghost" size="sm" onClick={handleEdit} className="h-8 w-8 p-0">
            <Edit3 className="h-4 w-4" />
          </Button>
        )}
        {onDelete && (
          <Button variant="ghost" size="sm" onClick={handleDelete} className="h-8 w-8 p-0 text-destructive hover:text-destructive">
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
};
