import torch
sd = torch.load('work_dirs/ckpt/model.ckpt', map_location='cpu', mmap=True, weights_only=False)['state_dict']
parts = {k: v.clone() for k, v in sd.items() if k.startswith('neck.') or k.startswith('decoder.')}
torch.save(parts, 'work_dirs/ckpt/idol_neck_decoder.pt')
ts = torch.jit.load('work_dirs/ckpt/sapiens_1b_epoch_173_torchscript.pt2', map_location='cpu').state_dict()
diff, n = 0.0, 0
for k, v in sd.items():
    if k.startswith('encoder.model.'):
        kk = k[len('encoder.model.'):]
        if kk in ts:
            diff = max(diff, (ts[kk].float() - v.float()).abs().max().item()); n += 1
print('neck/decoder tensors', len(parts), 'encoder tensors compared', n, 'max abs diff vs torchscript', diff, 'ckpt dtype', next(v.dtype for k, v in sd.items() if k.startswith('encoder.')))
