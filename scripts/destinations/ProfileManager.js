/**
 * Destination profile management facade for extension UI pages.
 */

import {
  AccountGatedDestinationEntitlementProvider,
  CREATE_PROFILE_COLORS,
  DEFAULT_PROFILE_ICON,
  DEFAULT_PROFILE_ID,
  DESTINATION_PROFILE_ERRORS,
  ensureMigratedDefaultProfile,
  LocalDestinationProfileRepository,
  createProfileId,
  normalizeProfile,
  nowTimestamp,
  pickNonEmptyString,
} from './ProfileStore.js';

export class ProfileManager {
  constructor(options = {}) {
    this.repository =
      options.repository ||
      new LocalDestinationProfileRepository({ chromeStorage: options.chromeStorage });
    this.entitlementProvider =
      options.entitlementProvider || new AccountGatedDestinationEntitlementProvider();
  }

  async ensureMigratedDefaultProfile() {
    return await ensureMigratedDefaultProfile(this.repository);
  }

  async listProfiles() {
    return await this.ensureMigratedDefaultProfile();
  }

  async getDestinationEntitlement() {
    return await this.entitlementProvider.getDestinationEntitlement();
  }

  async getLastUsedProfile() {
    const profiles = await this.listProfiles();
    const entitlement = await this.getDestinationEntitlement();
    const allowedProfiles = profiles.slice(0, entitlement.maxProfiles);
    if (allowedProfiles.length === 0) {
      return null;
    }

    const lastUsedProfileId = await this.repository.getLastUsedProfileId();
    return allowedProfiles.find(profile => profile.id === lastUsedProfileId) || allowedProfiles[0];
  }

  async setLastUsedProfile(profileId) {
    const profile = await this.getProfile(profileId);
    await this.repository.setLastUsedProfileId(profile.id);
    return profile;
  }

  async getProfile(profileId) {
    const profiles = await this.listProfiles();
    const profile = profiles.find(item => item.id === profileId);
    if (!profile) {
      throw new Error(DESTINATION_PROFILE_ERRORS.NOT_FOUND);
    }
    return profile;
  }

  async createProfile(input) {
    const profiles = await this.listProfiles();
    const entitlement = await this.getDestinationEntitlement();
    if (profiles.length >= entitlement.maxProfiles) {
      throw new Error(DESTINATION_PROFILE_ERRORS.LIMIT_REACHED);
    }

    const timestamp = nowTimestamp();
    const profileId = pickNonEmptyString(input?.id) || createProfileId();
    if (profiles.some(profile => profile.id === profileId)) {
      throw new Error(DESTINATION_PROFILE_ERRORS.DUPLICATE_ID);
    }
    const profile = normalizeProfile(
      {
        id: profileId,
        name: input?.name,
        icon: input?.icon || DEFAULT_PROFILE_ICON,
        color:
          input?.color || CREATE_PROFILE_COLORS[profiles.length % CREATE_PROFILE_COLORS.length],
        notionDataSourceId: input?.notionDataSourceId,
        notionDataSourceType: input?.notionDataSourceType,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      profiles.length
    );

    if (!profile) {
      throw new Error(DESTINATION_PROFILE_ERRORS.TARGET_REQUIRED);
    }

    const nextProfiles = [...profiles, profile];
    await this.repository.writeProfiles(nextProfiles);
    return profile;
  }

  async updateProfile(profileId, updates) {
    const profiles = await this.listProfiles();
    const profileIndex = profiles.findIndex(profile => profile.id === profileId);
    if (profileIndex === -1) {
      throw new Error(DESTINATION_PROFILE_ERRORS.NOT_FOUND);
    }

    const updatedProfile = normalizeProfile(
      {
        ...profiles[profileIndex],
        ...updates,
        id: profiles[profileIndex].id,
        updatedAt: nowTimestamp(),
      },
      profileIndex
    );

    if (!updatedProfile) {
      throw new Error(DESTINATION_PROFILE_ERRORS.TARGET_REQUIRED);
    }

    const nextProfiles = [...profiles];
    nextProfiles[profileIndex] = updatedProfile;
    await this.repository.writeProfiles(nextProfiles);

    if (updatedProfile.id === DEFAULT_PROFILE_ID) {
      await this.repository.writeLegacyTarget(updatedProfile);
    }

    return updatedProfile;
  }

  async deleteProfile(profileId) {
    const profiles = await this.listProfiles();
    if (profiles.length <= 1) {
      throw new Error(DESTINATION_PROFILE_ERRORS.LAST_DELETE);
    }

    const nextProfiles = profiles.filter(profile => profile.id !== profileId);
    if (nextProfiles.length === profiles.length) {
      throw new Error(DESTINATION_PROFILE_ERRORS.NOT_FOUND);
    }

    const lastUsedProfileId = await this.repository.getLastUsedProfileId();
    const nextLastUsedProfileId =
      lastUsedProfileId === profileId ? nextProfiles[0].id : lastUsedProfileId;
    await this.repository.writeProfiles(nextProfiles, {
      lastUsedProfileId: nextLastUsedProfileId,
    });
    return nextProfiles;
  }
}
