import torch
sd = torch.load('work_dirs/ckpt/model.ckpt', map_location='cpu', mmap=True, weights_only=False)['state_dict']
torch.save({k[len('encoder.'):]: v.clone() for k, v in sd.items() if k.startswith('encoder.')}, 'work_dirs/ckpt/idol_encoder_bf16.pt')
